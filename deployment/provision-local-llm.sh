#!/usr/bin/env bash
set -Eeuo pipefail

MODEL="${PROSMET_LOCAL_LLM_MODEL:-qwen3.5:9b}"
BASE_URL="${PROSMET_LOCAL_LLM_BASE_URL:-http://127.0.0.1:11434}"
STATE_ROOT="${PROSMET_STATE_ROOT:-$HOME/.prosmet-greenfield}"
STATE_FILE="${PROSMET_LOCAL_LLM_STATE_FILE:-$STATE_ROOT/local-llm.json}"
LOG_FILE="${PROSMET_LOCAL_LLM_LOG_FILE:-$STATE_ROOT/ollama.log}"
PID_FILE="${PROSMET_LOCAL_LLM_PID_FILE:-$STATE_ROOT/ollama.pid}"
INSTALL_OLLAMA="${PROSMET_INSTALL_OLLAMA:-1}"
PULL_TIMEOUT_SECONDS="${PROSMET_LOCAL_LLM_PULL_TIMEOUT_SECONDS:-2400}"
START_TIMEOUT_SECONDS="${PROSMET_LOCAL_LLM_START_TIMEOUT_SECONDS:-90}"

fail() {
  printf 'prosmet-local-llm: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command is missing: $1"
}

case "$BASE_URL" in
  http://127.0.0.1:11434|http://localhost:11434) ;;
  *) fail "local LLM endpoint must remain loopback-only: $BASE_URL" ;;
esac

[[ "$MODEL" =~ ^[A-Za-z0-9._/:+-]+$ ]] || fail "unsafe Ollama model identifier: $MODEL"
[[ "$PULL_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "invalid pull timeout"
[[ "$START_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "invalid start timeout"

mkdir -p "$STATE_ROOT"
chmod 0700 "$STATE_ROOT"
require_command curl
require_command node

install_ollama() {
  if command -v ollama >/dev/null 2>&1; then
    return
  fi
  [[ "$INSTALL_OLLAMA" == "1" ]] || fail "Ollama is not installed and automatic installation is disabled"
  command -v sudo >/dev/null 2>&1 || fail "Ollama is missing and sudo is unavailable"
  sudo -n true >/dev/null 2>&1 || fail "Ollama is missing and passwordless sudo is unavailable"

  local installer checksum
  installer="$(mktemp)"
  trap 'rm -f "${installer:-}"' RETURN
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://ollama.com/install.sh -o "$installer"
  [[ -s "$installer" ]] || fail "downloaded Ollama installer is empty"
  checksum="$(sha256sum "$installer" | awk '{print $1}')"
  printf 'prosmet-local-llm: downloaded official Ollama installer sha256=%s\n' "$checksum"
  sudo -n sh "$installer"
  command -v ollama >/dev/null 2>&1 || fail "Ollama installation completed without an ollama executable"
}

endpoint_ready() {
  curl --fail --silent --show-error --max-time 4 "$BASE_URL/api/tags" >/dev/null 2>&1
}

start_ollama() {
  if endpoint_ready; then
    return
  fi

  local started=0
  if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files --type=service 2>/dev/null | grep -q '^ollama\.service'; then
    if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
      sudo -n systemctl enable --now ollama
      started=1
    elif systemctl start ollama >/dev/null 2>&1; then
      started=1
    fi
  fi

  if [[ "$started" != "1" ]]; then
    if [[ -s "$PID_FILE" ]]; then
      local previous_pid
      previous_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
      if [[ "$previous_pid" =~ ^[0-9]+$ ]] && kill -0 "$previous_pid" >/dev/null 2>&1; then
        kill "$previous_pid" >/dev/null 2>&1 || true
        sleep 1
      fi
    fi
    nohup env -u RUNNER_TRACKING_ID \
      OLLAMA_HOST=127.0.0.1:11434 \
      ollama serve </dev/null >"$LOG_FILE" 2>&1 &
    local pid=$!
    disown "$pid" 2>/dev/null || true
    printf '%s\n' "$pid" > "$PID_FILE"
    chmod 0600 "$PID_FILE"
  fi

  local attempt
  for attempt in $(seq 1 "$START_TIMEOUT_SECONDS"); do
    if endpoint_ready; then
      return
    fi
    sleep 1
  done
  tail -n 120 "$LOG_FILE" 2>/dev/null || true
  fail "Ollama did not become ready at $BASE_URL"
}

verify_loopback_binding() {
  if ! command -v ss >/dev/null 2>&1; then
    return
  fi
  local listeners
  listeners="$(ss -H -ltn 'sport = :11434' 2>/dev/null | awk '{print $4}' || true)"
  [[ -n "$listeners" ]] || fail "Ollama is reachable but no TCP listener was found"
  if printf '%s\n' "$listeners" | grep -Eq '^(0\.0\.0\.0|\*|\[::\]|:::):?11434$'; then
    fail "Ollama is exposed on a wildcard interface; only loopback binding is permitted"
  fi
}

model_present() {
  ollama list 2>/dev/null | awk 'NR > 1 {print $1}' | grep -Fxq "$MODEL"
}

pull_model() {
  if model_present; then
    printf 'prosmet-local-llm: model already present: %s\n' "$MODEL"
    return
  fi
  printf 'prosmet-local-llm: pulling model %s\n' "$MODEL"
  timeout "$PULL_TIMEOUT_SECONDS" ollama pull "$MODEL"
  model_present || fail "Ollama did not report the pulled model: $MODEL"
}

smoke_test() {
  local request_file response_file started_at completed_at latency_ms
  request_file="$(mktemp)"
  response_file="$(mktemp)"
  trap 'rm -f "${request_file:-}" "${response_file:-}"' RETURN

  node - "$MODEL" "$request_file" <<'NODE'
const fs = require("node:fs");
const model = process.argv[2];
const target = process.argv[3];
fs.writeFileSync(target, JSON.stringify({
  model,
  messages: [
    {
      role: "system",
      content: "Return exactly one valid JSON object. Do not use markdown."
    },
    {
      role: "user",
      content: "Return {\"text\":\"OK\",\"artifact\":null,\"estimate\":null}."
    }
  ],
  stream: false,
  format: "json",
  keep_alive: "15m",
  options: {
    temperature: 0,
    num_ctx: 32768
  }
}));
NODE

  started_at="$(date +%s%3N)"
  curl --fail --silent --show-error --max-time 300 \
    -H 'content-type: application/json' \
    --data-binary "@$request_file" \
    "$BASE_URL/api/chat" > "$response_file"
  completed_at="$(date +%s%3N)"
  latency_ms="$((completed_at - started_at))"

  node - "$response_file" <<'NODE'
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const content = body?.message?.content ?? body?.response;
if (typeof content !== "string" || !content.trim()) {
  throw new Error("Ollama smoke test returned no message content");
}
let envelope;
try {
  envelope = JSON.parse(content);
} catch {
  throw new Error(`Ollama smoke test did not return JSON: ${content.slice(0, 240)}`);
}
if (!/OK/i.test(String(envelope?.text || ""))) {
  throw new Error(`Ollama smoke test returned an unexpected envelope: ${content.slice(0, 240)}`);
}
NODE

  printf '%s\n' "$latency_ms"
}

write_state() {
  local latency_ms="$1"
  local version gpu
  version="$(ollama -v 2>&1 | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/ $//')"
  gpu="cpu-or-unknown"
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
    gpu="nvidia"
  elif command -v rocminfo >/dev/null 2>&1; then
    gpu="amd-rocm"
  fi

  node - "$STATE_FILE" "$MODEL" "$BASE_URL" "$version" "$latency_ms" "$gpu" <<'NODE'
const fs = require("node:fs");
const [target, model, baseUrl, version, latency, accelerator] = process.argv.slice(2);
const state = {
  ok: true,
  provider: "ollama",
  model,
  baseUrl,
  version,
  accelerator,
  smokeTestLatencyMs: Number(latency),
  verifiedAt: new Date().toISOString(),
  exposure: "loopback-only"
};
fs.writeFileSync(target, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
NODE
  chmod 0600 "$STATE_FILE"
  cat "$STATE_FILE"
}

install_ollama
start_ollama
verify_loopback_binding
pull_model
LATENCY_MS="$(smoke_test)"
write_state "$LATENCY_MS"
printf 'prosmet-local-llm: ready model=%s endpoint=%s latencyMs=%s\n' "$MODEL" "$BASE_URL" "$LATENCY_MS"
