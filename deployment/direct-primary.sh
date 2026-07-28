#!/usr/bin/env bash
set -Eeuo pipefail

COMMIT_SHA="${1:?commit sha is required}"
PORT="${2:-3200}"
ROOT="${HOME}/.prosmet"
RELEASES_ROOT="${ROOT}/releases"
RELEASE="${RELEASES_ROOT}/${COMMIT_SHA}"
STAGING="${RELEASE}.staging-$$"
PID_FILE="${ROOT}/prosmet.pid"
LOG_FILE="${ROOT}/prosmet.log"
DATABASE_ENV="${ROOT}/database.env"
RELEASE_STATUS="${ROOT}/release.json"
PROVIDER_KEY_FILE="${ROOT}/provider-master-key"

if [[ ! -f "${DATABASE_ENV}" ]]; then
  echo "Missing ${DATABASE_ENV}; run deployment/provision-postgres.sh first" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${DATABASE_ENV}"
: "${DATABASE_URL:?DATABASE_URL is required}"

if [[ -z "${PROSMET_PROVIDER_MASTER_KEY:-}" && -s "${PROVIDER_KEY_FILE}" ]]; then
  PROSMET_PROVIDER_MASTER_KEY="$(tr -d '\r\n' < "${PROVIDER_KEY_FILE}")"
fi
: "${PROSMET_PROVIDER_MASTER_KEY:?PROSMET_PROVIDER_MASTER_KEY is required}"

mkdir -p "${ROOT}" "${RELEASES_ROOT}"
rm -rf "${STAGING}"
mkdir -p "${STAGING}/.next"

# Build every release in a new empty directory. The previous implementation
# removed only non-hidden files and could leave a stale .next tree/chunks behind.
cp -a .next/standalone/. "${STAGING}/"
rm -rf "${STAGING}/.next/static"
cp -a .next/static "${STAGING}/.next/static"
if [[ -d public ]]; then
  rm -rf "${STAGING}/public"
  cp -a public "${STAGING}/public"
fi

rm -rf "${RELEASE}"
mv "${STAGING}" "${RELEASE}"

stop_pid() {
  local pid="${1:-}"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 0
  kill -0 "${pid}" 2>/dev/null || return 0
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 30); do
    kill -0 "${pid}" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -9 "${pid}" 2>/dev/null || true
}

if [[ -f "${PID_FILE}" ]]; then
  stop_pid "$(cat "${PID_FILE}" 2>/dev/null || true)"
  rm -f "${PID_FILE}"
fi

# A previous failed workflow may have lost its pid file. Stop only listeners
# whose working directory is one of Prosmet's immutable release directories.
if command -v fuser >/dev/null 2>&1; then
  for pid in $(fuser -n tcp "${PORT}" 2>/dev/null || true); do
    [[ "${pid}" =~ ^[0-9]+$ ]] || continue
    cwd="$(readlink -f "/proc/${pid}/cwd" 2>/dev/null || true)"
    if [[ "${cwd}" == "${RELEASES_ROOT}"/* ]]; then
      stop_pid "${pid}"
    else
      echo "Port ${PORT} is occupied by unrelated pid=${pid} cwd=${cwd:-unknown}" >&2
      exit 1
    fi
  done
fi

for _ in $(seq 1 30); do
  if ! ss -H -ltn "sport = :${PORT}" 2>/dev/null | grep -q .; then
    break
  fi
  sleep 0.5
done
if ss -H -ltn "sport = :${PORT}" 2>/dev/null | grep -q .; then
  echo "Port ${PORT} is still occupied" >&2
  ss -H -ltnp "sport = :${PORT}" || true
  exit 1
fi

cd "${RELEASE}"
nohup env \
  RUNNER_TRACKING_ID= \
  NODE_ENV=production \
  PORT="${PORT}" \
  HOSTNAME=0.0.0.0 \
  PROSMET_RELEASE_SHA="${COMMIT_SHA}" \
  PROSMET_DATABASE_DRIVER=postgres \
  DATABASE_URL="${DATABASE_URL}" \
  PROSMET_DEFAULT_PROVIDER="${PROSMET_DEFAULT_PROVIDER:-rules}" \
  PROSMET_PROVIDER_MASTER_KEY="${PROSMET_PROVIDER_MASTER_KEY}" \
  PROSMET_MASTER_KEY="${PROSMET_PROVIDER_MASTER_KEY}" \
  PROSMET_SESSION_SECRET="${PROSMET_SESSION_SECRET:-}" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}" \
  MIMO_API_KEY="${MIMO_API_KEY:-}" \
  MIMO_BASE_URL="${MIMO_BASE_URL:-}" \
  MIMO_MODEL="${MIMO_MODEL:-}" \
  OPENAI_COMPATIBLE_API_KEY="${OPENAI_COMPATIBLE_API_KEY:-}" \
  OPENAI_COMPATIBLE_BASE_URL="${OPENAI_COMPATIBLE_BASE_URL:-}" \
  OPENAI_COMPATIBLE_MODEL="${OPENAI_COMPATIBLE_MODEL:-}" \
  OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-}" \
  OLLAMA_MODEL="${OLLAMA_MODEL:-}" \
  NEXT_PUBLIC_AGUI_AGENT_URL=/api/agent \
  node server.js > "${LOG_FILE}" 2>&1 < /dev/null &
APP_PID=$!
echo "${APP_PID}" > "${PID_FILE}"

BASE_URL="http://127.0.0.1:${PORT}"
for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/api/health" > "${ROOT}/primary-health.json" && \
     curl -fsS "${BASE_URL}/api/backend/status" > "${ROOT}/primary-backend.json" && \
     grep -q '"connected":true' "${ROOT}/primary-backend.json" && \
     grep -q '"driver":"postgres"' "${ROOT}/primary-backend.json" && \
     grep -q "\"releaseSha\":\"${COMMIT_SHA}\"" "${ROOT}/primary-health.json"; then
    break
  fi
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    echo "Prosmet exited before becoming healthy" >&2
    tail -n 250 "${LOG_FILE}" || true
    exit 1
  fi
  if [[ "${attempt}" == "60" ]]; then
    tail -n 250 "${LOG_FILE}" || true
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d '{"deviceId":"deployment-probe","operations":[]}' \
  "${BASE_URL}/api/sync" > "${ROOT}/primary-sync.json"

curl --fail --silent --show-error --no-buffer --max-time 60 \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"threadId":"deployment-probe","runId":"deployment-probe","messages":[{"id":"probe-user","role":"user","content":[{"type":"text","text":"Проверка backend Просметчика"}]}],"tools":[],"context":{},"state":{}}' \
  "${BASE_URL}/api/agent" > "${ROOT}/primary-agent.sse"

node --input-type=module - "${ROOT}/primary-agent.sse" <<'NODE'
import { readFile } from "node:fs/promises";

const file = process.argv[2];
const raw = await readFile(file, "utf8");
const events = raw
  .split(/\r?\n/)
  .filter((line) => line.startsWith("data: "))
  .map((line) => JSON.parse(line.slice(6)));

const types = new Set(events.map((item) => item.type));
for (const required of ["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED"]) {
  if (!types.has(required)) throw new Error(`Missing AG-UI event: ${required}`);
}
for (const item of events) {
  if (
    [
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "ACTIVITY_SNAPSHOT",
      "ACTIVITY_DELTA"
    ].includes(item.type) &&
    (typeof item.messageId !== "string" || !item.messageId)
  ) {
    throw new Error(`${item.type} is missing messageId`);
  }
}
console.log(`Validated ${events.length} AG-UI events`);
NODE

cat > "${RELEASE_STATUS}" <<JSON
{
  "releaseSha": "${COMMIT_SHA}",
  "pid": ${APP_PID},
  "port": ${PORT},
  "releaseDirectory": "${RELEASE}",
  "url": "http://78.17.4.108:${PORT}/",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

# Keep the five newest immutable releases and remove only older directories.
find "${RELEASES_ROOT}" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 5 { sub(/^[^ ]+ /, ""); print }' \
  | xargs -r rm -rf --

echo "Prosmet ${COMMIT_SHA} is healthy at ${BASE_URL} with PostgreSQL"
