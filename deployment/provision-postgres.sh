#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
ENV_FILE="${ROOT}/database.env"
PASSWORD_FILE="${ROOT}/postgres-password"
STATUS_FILE="${ROOT}/postgres-status.json"
LOG_FILE="${ROOT}/postgres.log"
RUNTIME_ROOT="${ROOT}/runtime/postgresql-16"
PACKAGE_CACHE="${ROOT}/packages/postgresql-16"
DATA_DIR="${ROOT}/postgres-data-v16"
SOCKET_DIR="${ROOT}/run/postgresql"
RETIRED_DIR="${ROOT}/retired"
LEGACY_PID_FILE="${ROOT}/postgres.pid"
LEGACY_DATA_DIR="${ROOT}/data/postgres"
DATABASE_USER="prosmet"
DATABASE_NAME="prosmet"
DATABASE_HOST="127.0.0.1"
DATABASE_PORT="${PROSMET_POSTGRES_PORT:-55432}"

mkdir -p "${ROOT}" "${PACKAGE_CACHE}" "${SOCKET_DIR}" "${RETIRED_DIR}"
chmod 700 "${ROOT}" "${PACKAGE_CACHE}" "${SOCKET_DIR}" "${RETIRED_DIR}"

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
export PROSMET_POSTGRES_BIN='${PG_BINDIR}'
export PROSMET_POSTGRES_DATA='${DATA_DIR}'
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

# Respect a real externally managed PostgreSQL when the owner supplies one.
if [[ -n "${DATABASE_URL:-}" ]] && probe_database_url "${DATABASE_URL}" >/dev/null 2>&1; then
  PG_BINDIR="external"
  umask 077
  cat > "${ENV_FILE}" <<ENV
export PROSMET_DATABASE_DRIVER=postgres
export DATABASE_URL='${DATABASE_URL}'
export PROSMET_POSTGRES_BIN='external'
export PROSMET_POSTGRES_DATA='external'
ENV
  chmod 600 "${ENV_FILE}"
  echo "Using configured PostgreSQL DATABASE_URL"
  exit 0
fi

retire_path() {
  local source="${1:?source path is required}"
  local label="${2:?label is required}"
  [[ -e "${source}" ]] || return 0
  local destination="${RETIRED_DIR}/${label}-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "${source}" "${destination}"
  echo "Retired ${source} to ${destination}"
}

# Stop and retire the incompatible embedded/WASM experiment once.
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
retire_path "${LEGACY_DATA_DIR}" "embedded-postgres"

find_pg_bindir() {
  find "${RUNTIME_ROOT}/usr/lib/postgresql" \
    -mindepth 3 -maxdepth 3 -type f -name postgres -print 2>/dev/null \
    | sort -V | tail -n 1 | xargs -r dirname
}

PG_BINDIR="$(find_pg_bindir)"
if [[ -z "${PG_BINDIR}" || ! -x "${PG_BINDIR}/initdb" ]]; then
  command -v apt-get >/dev/null 2>&1 || {
    echo "apt-get is required to download the signed Ubuntu PostgreSQL package" >&2
    exit 1
  }
  command -v dpkg-deb >/dev/null 2>&1 || {
    echo "dpkg-deb is required to extract the Ubuntu PostgreSQL package" >&2
    exit 1
  }

  rm -rf "${RUNTIME_ROOT}"
  mkdir -p "${RUNTIME_ROOT}" "${PACKAGE_CACHE}"
  rm -f "${PACKAGE_CACHE}"/*.deb

  packages=(postgresql-16 postgresql-client-16 libpq5)
  optional_packages=(
    libicu74
    libldap2
    libllvm17t64
    liblz4-1
    libpam0g
    libreadline8t64
    libssl3t64
    libxml2
    libxslt1.1
    libzstd1
    zlib1g
  )

  pushd "${PACKAGE_CACHE}" >/dev/null
  for package in "${packages[@]}"; do
    apt-cache show "${package}" >/dev/null 2>&1 || {
      echo "Required Ubuntu package is unavailable: ${package}" >&2
      exit 1
    }
    apt-get download "${package}"
  done
  for package in "${optional_packages[@]}"; do
    if apt-cache show "${package}" >/dev/null 2>&1; then
      apt-get download "${package}" || true
    fi
  done
  popd >/dev/null

  shopt -s nullglob
  debs=("${PACKAGE_CACHE}"/*.deb)
  if [[ "${#debs[@]}" -lt 2 ]]; then
    echo "PostgreSQL package download did not produce the expected .deb files" >&2
    exit 1
  fi
  for archive in "${debs[@]}"; do
    dpkg-deb -x "${archive}" "${RUNTIME_ROOT}"
  done
  shopt -u nullglob

  PG_BINDIR="$(find_pg_bindir)"
fi

if [[ -z "${PG_BINDIR}" || ! -x "${PG_BINDIR}/postgres" || ! -x "${PG_BINDIR}/initdb" ]]; then
  echo "A runnable PostgreSQL server was not found after package extraction" >&2
  exit 1
fi

PG_MAJOR="$(basename "$(dirname "${PG_BINDIR}")")"
PG_SHAREDIR="${RUNTIME_ROOT}/usr/share/postgresql/${PG_MAJOR}"
PG_LIBDIR="${RUNTIME_ROOT}/usr/lib/x86_64-linux-gnu:${RUNTIME_ROOT}/lib/x86_64-linux-gnu"
export PATH="${PG_BINDIR}:${PATH}"
export LD_LIBRARY_PATH="${PG_LIBDIR}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}"

missing_libraries="$(ldd "${PG_BINDIR}/postgres" 2>/dev/null | awk '/not found/{print $1}' | paste -sd, -)"
if [[ -n "${missing_libraries}" ]]; then
  echo "PostgreSQL package has unresolved runtime libraries: ${missing_libraries}" >&2
  ldd "${PG_BINDIR}/postgres" >&2 || true
  exit 1
fi

LOCAL_DATABASE_URL="$(build_database_url)"
if probe_database_url "${LOCAL_DATABASE_URL}" >/dev/null 2>&1; then
  write_environment
  echo "Rootless PostgreSQL is already ready on ${DATABASE_HOST}:${DATABASE_PORT}"
  exit 0
fi

if [[ -f "${DATA_DIR}/PG_VERSION" ]] && [[ "$(cat "${DATA_DIR}/PG_VERSION")" != "${PG_MAJOR}" ]]; then
  retire_path "${DATA_DIR}" "postgres-data-version-mismatch"
fi

if [[ ! -f "${DATA_DIR}/PG_VERSION" ]]; then
  rm -rf "${DATA_DIR}"
  mkdir -p "${DATA_DIR}"
  chmod 700 "${DATA_DIR}"
  PW_FILE="${ROOT}/.postgres-init-password"
  printf '%s\n' "${PASSWORD}" > "${PW_FILE}"
  chmod 600 "${PW_FILE}"
  "${PG_BINDIR}/initdb" \
    --pgdata="${DATA_DIR}" \
    --username="${DATABASE_USER}" \
    --pwfile="${PW_FILE}" \
    --encoding=UTF8 \
    --locale=C.UTF-8 \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --waldir="${DATA_DIR}/pg_wal" \
    -L "${PG_SHAREDIR}"
  rm -f "${PW_FILE}"

  cat >> "${DATA_DIR}/postgresql.conf" <<CONF
listen_addresses = '${DATABASE_HOST}'
port = ${DATABASE_PORT}
unix_socket_directories = '${SOCKET_DIR}'
password_encryption = 'scram-sha-256'
timezone = 'UTC'
max_connections = 100
shared_buffers = '128MB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
jit = off
ssl = off
logging_collector = off
log_min_messages = warning
CONF
fi
chmod 700 "${DATA_DIR}"

if ! "${PG_BINDIR}/pg_ctl" -D "${DATA_DIR}" status >/dev/null 2>&1; then
  : > "${LOG_FILE}"
  chmod 600 "${LOG_FILE}"
  env RUNNER_TRACKING_ID= \
    "${PG_BINDIR}/pg_ctl" \
      -D "${DATA_DIR}" \
      -l "${LOG_FILE}" \
      -o "-h ${DATABASE_HOST} -p ${DATABASE_PORT} -k ${SOCKET_DIR}" \
      -w start
fi

for _ in $(seq 1 60); do
  "${PG_BINDIR}/pg_isready" -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" >/dev/null 2>&1 && break
  sleep 1
done
if ! "${PG_BINDIR}/pg_isready" -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" >/dev/null 2>&1; then
  tail -n 250 "${LOG_FILE}" || true
  echo "Rootless PostgreSQL did not become ready" >&2
  exit 1
fi

export PGPASSWORD="${PASSWORD}"
if ! "${PG_BINDIR}/psql" -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" \
  --dbname=postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${DATABASE_NAME}'" \
  | grep -q 1; then
  "${PG_BINDIR}/createdb" \
    -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" \
    --owner="${DATABASE_USER}" "${DATABASE_NAME}"
fi

"${PG_BINDIR}/psql" \
  -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" \
  --dbname="${DATABASE_NAME}" -v ON_ERROR_STOP=1 <<SQL
ALTER DATABASE ${DATABASE_NAME} SET timezone TO 'UTC';
GRANT CONNECT, TEMPORARY ON DATABASE ${DATABASE_NAME} TO ${DATABASE_USER};
SQL

if ! probe_database_url "${LOCAL_DATABASE_URL}" >/dev/null 2>&1; then
  tail -n 250 "${LOG_FILE}" || true
  echo "Rootless PostgreSQL did not accept the application DATABASE_URL" >&2
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
  console.log(JSON.stringify({
    ready: true,
    distribution: "Ubuntu postgresql-16 package (rootless extraction)",
    ...result.rows[0]
  }, null, 2));
} finally {
  await client.end();
}
NODE
chmod 600 "${STATUS_FILE}"

echo "Real rootless PostgreSQL ${PG_MAJOR} is ready on ${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"
