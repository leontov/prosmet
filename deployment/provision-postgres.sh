#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
ENV_FILE="${ROOT}/database.env"
ROLE_NAME="prosmet_app"
DATABASE_NAME="prosmet"
DATABASE_HOST="127.0.0.1"
DATABASE_PORT="5432"

mkdir -p "${ROOT}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
    if psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -tAc 'SELECT 1' >/dev/null 2>&1; then
      echo "PostgreSQL is already ready"
      exit 0
    fi
  fi
fi

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_isready >/dev/null 2>&1; then
  sudo -n apt-get update
  sudo -n env DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
fi

sudo -n systemctl enable --now postgresql

for attempt in $(seq 1 30); do
  if pg_isready -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" == "30" ]]; then
    sudo -n systemctl status postgresql --no-pager || true
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

PASSWORD="$(openssl rand -hex 24)"

if sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${ROLE_NAME}'" | grep -q 1; then
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -c \
    "ALTER ROLE ${ROLE_NAME} WITH LOGIN PASSWORD '${PASSWORD}'"
else
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE ${ROLE_NAME} WITH LOGIN PASSWORD '${PASSWORD}'"
fi

if ! sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DATABASE_NAME}'" | grep -q 1; then
  sudo -n -u postgres createdb -O "${ROLE_NAME}" "${DATABASE_NAME}"
else
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -c \
    "ALTER DATABASE ${DATABASE_NAME} OWNER TO ${ROLE_NAME}"
fi

DATABASE_URL="postgresql://${ROLE_NAME}:${PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"

cat > "${ENV_FILE}" <<ENV
export PROSMET_DATABASE_DRIVER=postgres
export DATABASE_URL='${DATABASE_URL}'
ENV
chmod 600 "${ENV_FILE}"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -tAc 'SELECT current_database(), current_user' | tee "${ROOT}/postgres-status.txt"
echo "PostgreSQL provisioned for Prosmet"
