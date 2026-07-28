#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
ENV_FILE="${ROOT}/database.env"
PASSWORD_FILE="${ROOT}/postgres-password"
PID_FILE="${ROOT}/postgres.pid"
READY_FILE="${ROOT}/postgres-ready.json"
LOG_FILE="${ROOT}/postgres.log"
DATA_DIR="${ROOT}/data/postgres"
DATABASE_USER="prosmet"
DATABASE_NAME="prosmet"
DATABASE_HOST="127.0.0.1"
DATABASE_PORT="55432"

mkdir -p "${ROOT}" "$(dirname "${DATA_DIR}")"

if [[ ! -s "${PASSWORD_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 > "${PASSWORD_FILE}"
fi
chmod 600 "${PASSWORD_FILE}"
PASSWORD="$(tr -d '\r\n' < "${PASSWORD_FILE}")"
DATABASE_URL="postgresql://${DATABASE_USER}:${PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"

write_environment() {
  umask 077
  cat > "${ENV_FILE}" <<ENV
export PROSMET_DATABASE_DRIVER=postgres
export DATABASE_URL='${DATABASE_URL}'
ENV
  chmod 600 "${ENV_FILE}"
}

probe_database() {
  DATABASE_URL="${DATABASE_URL}" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2500
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT current_database() AS database, current_user AS user, version() AS version"
  );
  if (result.rows[0]?.database !== "prosmet") process.exit(2);
  if (result.rows[0]?.user !== "prosmet") process.exit(3);
} finally {
  await client.end().catch(() => undefined);
}
NODE
}

if probe_database >/dev/null 2>&1; then
  write_environment
  echo "PostgreSQL is already ready on ${DATABASE_HOST}:${DATABASE_PORT}"
  exit 0
fi

if [[ -f "${PID_FILE}" ]]; then
  OLD_PID="$(cat "${PID_FILE}" || true)"
  if [[ "${OLD_PID}" =~ ^[0-9]+$ ]] && kill -0 "${OLD_PID}" 2>/dev/null; then
    kill "${OLD_PID}" || true
    for attempt in $(seq 1 20); do
      kill -0 "${OLD_PID}" 2>/dev/null || break
      sleep 1
    done
  fi
fi
rm -f "${PID_FILE}" "${READY_FILE}"

if command -v ss >/dev/null 2>&1 && ss -H -ltn "sport = :${DATABASE_PORT}" | grep -q .; then
  echo "Port ${DATABASE_PORT} is occupied by an unknown process" >&2
  ss -H -ltnp "sport = :${DATABASE_PORT}" || true
  exit 1
fi

RUNNER_TRACKING_ID= \
PROSMET_POSTGRES_DATA_DIR="${DATA_DIR}" \
PROSMET_POSTGRES_PORT="${DATABASE_PORT}" \
PROSMET_POSTGRES_USER="${DATABASE_USER}" \
PROSMET_POSTGRES_PASSWORD="${PASSWORD}" \
PROSMET_POSTGRES_DATABASE="${DATABASE_NAME}" \
PROSMET_POSTGRES_READY_FILE="${READY_FILE}" \
nohup node deployment/postgres-server.mjs > "${LOG_FILE}" 2>&1 < /dev/null &
POSTGRES_PID=$!
echo "${POSTGRES_PID}" > "${PID_FILE}"

for attempt in $(seq 1 120); do
  if probe_database >/dev/null 2>&1; then
    write_environment
    DATABASE_URL="${DATABASE_URL}" node --input-type=module <<'NODE' | tee "${HOME}/.prosmet/postgres-status.json"
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(
    "SELECT current_database() AS database, current_user AS user, version() AS version"
  );
  console.log(JSON.stringify({ ready: true, ...result.rows[0] }, null, 2));
} finally {
  await client.end();
}
NODE
    echo "PostgreSQL provisioned without sudo on ${DATABASE_HOST}:${DATABASE_PORT}"
    exit 0
  fi

  if ! kill -0 "${POSTGRES_PID}" 2>/dev/null; then
    echo "PostgreSQL launcher exited before becoming ready" >&2
    tail -n 250 "${LOG_FILE}" || true
    exit 1
  fi
  sleep 2
done

echo "PostgreSQL did not become ready within 240 seconds" >&2
tail -n 250 "${LOG_FILE}" || true
exit 1
