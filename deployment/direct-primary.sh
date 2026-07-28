#!/usr/bin/env bash
set -Eeuo pipefail

COMMIT_SHA="${1:?commit sha is required}"
PORT="${2:-3200}"
ROOT="${HOME}/.prosmet"
RELEASE="${ROOT}/releases/${COMMIT_SHA}"
PID_FILE="${ROOT}/prosmet.pid"
LOG_FILE="${ROOT}/prosmet.log"
DATABASE_ENV="${ROOT}/database.env"

if [[ ! -f "${DATABASE_ENV}" ]]; then
  echo "Missing ${DATABASE_ENV}; run deployment/provision-postgres.sh first" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${DATABASE_ENV}"
: "${DATABASE_URL:?DATABASE_URL is required}"

mkdir -p "${RELEASE}/.next"
rm -rf "${RELEASE:?}"/*
cp -a .next/standalone/. "${RELEASE}/"
cp -a .next/static "${RELEASE}/.next/static"
cp -a public "${RELEASE}/public"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ "${OLD_PID}" =~ ^[0-9]+$ ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" || true
    for attempt in $(seq 1 15); do
      kill -0 "${OLD_PID}" 2>/dev/null || break
      sleep 1
    done
  fi
fi

if command -v ss >/dev/null 2>&1 && ss -H -ltn "sport = :${PORT}" | grep -q .; then
  echo "Port ${PORT} is occupied" >&2
  exit 1
fi

cd "${RELEASE}"
env \
  RUNNER_TRACKING_ID= \
  NODE_ENV=production \
  PORT="${PORT}" \
  HOSTNAME=0.0.0.0 \
  PROSMET_DATABASE_DRIVER=postgres \
  DATABASE_URL="${DATABASE_URL}" \
  PROSMET_DEFAULT_PROVIDER="${PROSMET_DEFAULT_PROVIDER:-rules}" \
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
  nohup node server.js > "${LOG_FILE}" 2>&1 < /dev/null &
APP_PID=$!
echo "${APP_PID}" > "${PID_FILE}"

BASE_URL="http://127.0.0.1:${PORT}"
for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/api/health" > "${ROOT}/primary-health.json" && \
     curl -fsS "${BASE_URL}/api/backend/status" > "${ROOT}/primary-backend.json" && \
     grep -q '"connected":true' "${ROOT}/primary-backend.json" && \
     grep -q '"driver":"postgres"' "${ROOT}/primary-backend.json"; then
    break
  fi
  if [[ "${attempt}" == "60" ]]; then
    tail -n 200 "${LOG_FILE}" || true
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

echo "Prosmet is healthy at ${BASE_URL} with PostgreSQL"
