#!/usr/bin/env bash
set -Eeuo pipefail

COMMIT_SHA="${1:?commit sha is required}"
PORT="${2:-3200}"
ROOT="${HOME}/.prosmet"
RELEASE="${ROOT}/releases/${COMMIT_SHA}"
DATA_DIR="${ROOT}/data/postgres"
PID_FILE="${ROOT}/prosmet.pid"
LOG_FILE="${ROOT}/prosmet.log"

mkdir -p "${RELEASE}/.next" "${DATA_DIR}"
rm -rf "${RELEASE:?}"/*
cp -a .next/standalone/. "${RELEASE}/"
cp -a .next/static "${RELEASE}/.next/static"
cp -a public "${RELEASE}/public"

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ "${OLD_PID}" =~ ^[0-9]+$ ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" || true
    sleep 2
  fi
fi

if command -v ss >/dev/null 2>&1 && ss -H -ltn "sport = :${PORT}" | grep -q .; then
  echo "Port ${PORT} is occupied" >&2
  exit 1
fi

cd "${RELEASE}"
env \
  NODE_ENV=production \
  PORT="${PORT}" \
  HOSTNAME=0.0.0.0 \
  PROSMET_DATABASE_DRIVER=pglite \
  PROSMET_PGLITE_DIR="${DATA_DIR}" \
  PROSMET_DEFAULT_PROVIDER="${PROSMET_DEFAULT_PROVIDER:-rules}" \
  NEXT_PUBLIC_AGUI_AGENT_URL=/api/agent \
  nohup node server.js > "${LOG_FILE}" 2>&1 < /dev/null &
APP_PID=$!
echo "${APP_PID}" > "${PID_FILE}"

BASE_URL="http://127.0.0.1:${PORT}"
for attempt in $(seq 1 60); do
  if curl -fsS "${BASE_URL}/api/health" > "${ROOT}/primary-health.json" && \
     curl -fsS "${BASE_URL}/api/backend/status" > "${ROOT}/primary-backend.json" && \
     grep -q '"connected":true' "${ROOT}/primary-backend.json"; then
    break
  fi
  if [[ "${attempt}" == "60" ]]; then
    tail -n 200 "${LOG_FILE}" || true
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error --no-buffer --max-time 60 \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"threadId":"deployment-probe","runId":"deployment-probe","messages":[{"id":"probe-user","role":"user","content":[{"type":"text","text":"Проверка backend Просметчика"}]}],"tools":[],"context":{},"state":{}}' \
  "${BASE_URL}/api/agent" > "${ROOT}/primary-agent.sse"

grep -q '"type":"RUN_STARTED"' "${ROOT}/primary-agent.sse"
grep -q '"type":"TEXT_MESSAGE_CONTENT"' "${ROOT}/primary-agent.sse"
grep -q '"type":"RUN_FINISHED"' "${ROOT}/primary-agent.sse"

echo "Prosmet is healthy at ${BASE_URL}"
