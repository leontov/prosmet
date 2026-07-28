#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
ENV_FILE="${ROOT}/database.env"
PASSWORD_FILE="${ROOT}/postgres-password"
STATUS_FILE="${ROOT}/postgres-status.json"
LEGACY_PID_FILE="${ROOT}/postgres.pid"
LEGACY_DATA_DIR="${ROOT}/data/postgres"
RETIRED_DIR="${ROOT}/retired"
DATABASE_USER="prosmet"
DATABASE_NAME="prosmet"
DATABASE_HOST="127.0.0.1"
DATABASE_PORT="${PROSMET_POSTGRES_PORT:-5432}"

mkdir -p "${ROOT}" "${RETIRED_DIR}"
chmod 700 "${ROOT}" "${RETIRED_DIR}"

if [[ ! -s "${PASSWORD_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 > "${PASSWORD_FILE}"
fi
chmod 600 "${PASSWORD_FILE}"
PASSWORD="$(tr -d '\r\n' < "${PASSWORD_FILE}")"

build_database_url() {
  printf 'postgresql://%s:%s@%s:%s/%s' \
    "${DATABASE_USER}" "${PASSWORD}" "${DATABASE_HOST}" "${DATABASE_PORT}" "${DATABASE_NAME}"
}

write_environment() {
  local url
  url="$(build_database_url)"
  umask 077
  cat > "${ENV_FILE}" <<ENV
export PROSMET_DATABASE_DRIVER=postgres
export DATABASE_URL='${url}'
ENV
  chmod 600 "${ENV_FILE}"
}

probe_database_url() {
  local url="${1:?database url is required}"
  DATABASE_URL="${url}" node --input-type=module <<'NODE'
import pg from "pg";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS host, inet_server_port() AS port, version() AS version"
  );
  const row = result.rows[0];
  if (row?.database !== "prosmet") process.exit(2);
  if (row?.user !== "prosmet") process.exit(3);
} finally {
  await client.end().catch(() => undefined);
}
NODE
}

# Respect a real externally managed PostgreSQL when the owner provides one.
if [[ -n "${DATABASE_URL:-}" ]] && probe_database_url "${DATABASE_URL}" >/dev/null 2>&1; then
  umask 077
  cat > "${ENV_FILE}" <<ENV
export PROSMET_DATABASE_DRIVER=postgres
export DATABASE_URL='${DATABASE_URL}'
ENV
  chmod 600 "${ENV_FILE}"
  echo "Using the configured PostgreSQL DATABASE_URL"
  exit 0
fi

# Reuse the previously provisioned local database when it is healthy.
LOCAL_DATABASE_URL="$(build_database_url)"
if probe_database_url "${LOCAL_DATABASE_URL}" >/dev/null 2>&1; then
  write_environment
  echo "PostgreSQL is already ready on ${DATABASE_HOST}:${DATABASE_PORT}"
  exit 0
fi

# Stop and retire the failed embedded-postgres experiment. It is never reused.
if [[ -f "${LEGACY_PID_FILE}" ]]; then
  LEGACY_PID="$(cat "${LEGACY_PID_FILE}" 2>/dev/null || true)"
  if [[ "${LEGACY_PID}" =~ ^[0-9]+$ ]] && kill -0 "${LEGACY_PID}" 2>/dev/null; then
    kill "${LEGACY_PID}" 2>/dev/null || true
    for _ in $(seq 1 15); do
      kill -0 "${LEGACY_PID}" 2>/dev/null || break
      sleep 1
    done
  fi
  rm -f "${LEGACY_PID_FILE}"
fi
if [[ -d "${LEGACY_DATA_DIR}" ]]; then
  RETIRED_PATH="${RETIRED_DIR}/embedded-postgres-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${LEGACY_DATA_DIR}" "${RETIRED_PATH}"
  echo "Retired incompatible embedded PostgreSQL cluster to ${RETIRED_PATH}"
fi

if ! sudo -n true >/dev/null 2>&1; then
  echo "prosmet-primary must allow passwordless sudo to provision PostgreSQL" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_isready >/dev/null 2>&1; then
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get update -y
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y \
    postgresql postgresql-contrib
fi

sudo -n systemctl enable --now postgresql

# Ubuntu may choose a non-default port when another cluster already exists.
if command -v pg_lsclusters >/dev/null 2>&1; then
  CLUSTER_LINE="$(pg_lsclusters --no-header 2>/dev/null | awk '$4 == "online" { print; exit }')"
  if [[ -z "${CLUSTER_LINE}" ]]; then
    FIRST_CLUSTER="$(pg_lsclusters --no-header 2>/dev/null | awk 'NR == 1 { print $1, $2 }')"
    if [[ -n "${FIRST_CLUSTER}" ]]; then
      read -r PG_VERSION PG_NAME <<<"${FIRST_CLUSTER}"
      sudo -n pg_ctlcluster "${PG_VERSION}" "${PG_NAME}" start
      CLUSTER_LINE="$(pg_lsclusters --no-header 2>/dev/null | awk '$4 == "online" { print; exit }')"
    fi
  fi
  if [[ -n "${CLUSTER_LINE}" ]]; then
    DATABASE_PORT="$(awk '{print $3}' <<<"${CLUSTER_LINE}")"
  fi
fi

for _ in $(seq 1 60); do
  pg_isready -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" >/dev/null 2>&1 && break
  sleep 1
done
if ! pg_isready -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" >/dev/null 2>&1; then
  sudo -n systemctl status postgresql --no-pager || true
  echo "PostgreSQL service did not become ready" >&2
  exit 1
fi

sudo -n -u postgres psql -v ON_ERROR_STOP=1 --dbname=postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DATABASE_USER}') THEN
    CREATE ROLE ${DATABASE_USER} LOGIN PASSWORD '${PASSWORD}';
  ELSE
    ALTER ROLE ${DATABASE_USER} WITH LOGIN PASSWORD '${PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! sudo -n -u postgres psql --dbname=postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'" | grep -q 1; then
  sudo -n -u postgres createdb --owner="${DATABASE_USER}" "${DATABASE_NAME}"
fi

sudo -n -u postgres psql -v ON_ERROR_STOP=1 --dbname="${DATABASE_NAME}" <<SQL
ALTER DATABASE ${DATABASE_NAME} SET timezone TO 'UTC';
GRANT CONNECT, TEMPORARY ON DATABASE ${DATABASE_NAME} TO ${DATABASE_USER};
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

LOCAL_DATABASE_URL="$(build_database_url)"
if ! probe_database_url "${LOCAL_DATABASE_URL}" >/dev/null 2>&1; then
  echo "Provisioned PostgreSQL did not accept the application DATABASE_URL" >&2
  exit 1
fi

write_environment
DATABASE_URL="${LOCAL_DATABASE_URL}" node --input-type=module <<'NODE' > "${STATUS_FILE}"
import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const result = await client.query(
    "SELECT current_database() AS database, current_user AS user, inet_server_addr()::text AS host, inet_server_port() AS port, version() AS version"
  );
  console.log(JSON.stringify({ ready: true, ...result.rows[0] }, null, 2));
} finally {
  await client.end();
}
NODE
chmod 600 "${STATUS_FILE}"

echo "Real PostgreSQL is ready on ${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"
