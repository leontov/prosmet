#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-${PROSMET_PUBLIC_DOMAIN:-kolibriai.online}}"
UPSTREAM_PORT="${2:-3200}"
EXPECTED_IP="${PROSMET_PUBLIC_IP:-78.17.4.108}"
CADDY_VERSION="${PROSMET_CADDY_VERSION:-2.11.4}"
ROOT="${HOME}/.prosmet"
CADDY_ROOT="${ROOT}/caddy"
CACHE_ROOT="${ROOT}/packages/caddy-${CADDY_VERSION}"
ARCHIVE="caddy_${CADDY_VERSION}_linux_amd64.tar.gz"
CHECKSUMS="caddy_${CADDY_VERSION}_checksums.txt"
SOURCE_BASE="https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}"
SOURCE_BINARY="${CACHE_ROOT}/caddy"
INSTALLED_BINARY="/usr/local/bin/prosmet-caddy"
CONFIG_FILE="${CADDY_ROOT}/Caddyfile"
PID_FILE="${CADDY_ROOT}/caddy.pid"
LOG_FILE="${CADDY_ROOT}/caddy.log"
STATUS_FILE="${CADDY_ROOT}/status.json"
DATA_DIR="${CADDY_ROOT}/data"
CONFIG_DIR="${CADDY_ROOT}/config"

if [[ ! "${DOMAIN}" =~ ^[a-zA-Z0-9.-]+$ ]] || [[ "${DOMAIN}" != *.* ]]; then
  echo "Invalid public domain: ${DOMAIN}" >&2
  exit 2
fi
if [[ ! "${UPSTREAM_PORT}" =~ ^[0-9]+$ ]]; then
  echo "Invalid upstream port: ${UPSTREAM_PORT}" >&2
  exit 2
fi

mkdir -p "${ROOT}" "${CADDY_ROOT}" "${CACHE_ROOT}" "${DATA_DIR}" "${CONFIG_DIR}"
chmod 700 "${ROOT}" "${CADDY_ROOT}" "${DATA_DIR}" "${CONFIG_DIR}"

write_status() {
  local state="${1:?state is required}"
  local detail="${2:-}"
  local resolved="${3:-}"
  node --input-type=module - "${STATUS_FILE}" "${state}" "${detail}" "${resolved}" "${DOMAIN}" "${EXPECTED_IP}" "${UPSTREAM_PORT}" "${CADDY_VERSION}" <<'NODE'
import { writeFile } from "node:fs/promises";
const [file, state, detail, resolved, domain, expectedIp, upstreamPort, caddyVersion] = process.argv.slice(2);
await writeFile(
  file,
  JSON.stringify(
    {
      state,
      detail,
      domain,
      origin: `https://${domain}`,
      expectedIp,
      resolvedAddresses: resolved ? resolved.split(",").filter(Boolean) : [],
      upstream: `http://127.0.0.1:${upstreamPort}`,
      caddyVersion,
      checkedAt: new Date().toISOString()
    },
    null,
    2
  ) + "\n",
  { mode: 0o600 }
);
NODE
}

if [[ ! -x "${SOURCE_BINARY}" ]]; then
  rm -f "${CACHE_ROOT}/${ARCHIVE}" "${CACHE_ROOT}/${CHECKSUMS}"
  curl --fail --silent --show-error --location \
    "${SOURCE_BASE}/${ARCHIVE}" \
    --output "${CACHE_ROOT}/${ARCHIVE}"
  curl --fail --silent --show-error --location \
    "${SOURCE_BASE}/${CHECKSUMS}" \
    --output "${CACHE_ROOT}/${CHECKSUMS}"

  EXPECTED_SHA="$(node --input-type=module - "${CACHE_ROOT}/${CHECKSUMS}" "${ARCHIVE}" <<'NODE'
import { readFile } from "node:fs/promises";
const [checksumFile, archiveName] = process.argv.slice(2);
const lines = (await readFile(checksumFile, "utf8")).split(/\r?\n/);
const line = lines.find((entry) => entry.includes(archiveName));
const digest = line?.match(/\b[0-9a-fA-F]{64}\b/)?.[0]?.toLowerCase();
if (!digest) {
  process.stderr.write(`Caddy checksum entry is missing or malformed for ${archiveName}\n`);
  process.exit(1);
}
process.stdout.write(digest);
NODE
)"
  ACTUAL_SHA="$(sha256sum "${CACHE_ROOT}/${ARCHIVE}" | awk '{print tolower($1)}')"
  if [[ "${ACTUAL_SHA}" != "${EXPECTED_SHA}" ]]; then
    echo "Caddy archive checksum mismatch for ${ARCHIVE}" >&2
    echo "expected=${EXPECTED_SHA}" >&2
    echo "actual=${ACTUAL_SHA}" >&2
    exit 1
  fi

  tar -xzf "${CACHE_ROOT}/${ARCHIVE}" -C "${CACHE_ROOT}" caddy
  chmod 755 "${SOURCE_BINARY}"
fi

if ! command -v sudo >/dev/null 2>&1 || ! sudo -n true >/dev/null 2>&1; then
  write_status "blocked" "Passwordless sudo is required once to bind ports 80 and 443." ""
  echo "Passwordless sudo is required to install the HTTPS edge binary and bind ports 80/443" >&2
  exit 1
fi

if ! command -v setcap >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n apt-get install -y --no-install-recommends libcap2-bin
fi

sudo -n install -m 0755 "${SOURCE_BINARY}" "${INSTALLED_BINARY}"
sudo -n setcap 'cap_net_bind_service=+ep' "${INSTALLED_BINARY}"

RESOLVED_ADDRESSES="$({
  node --input-type=module - "${DOMAIN}" <<'NODE'
import { resolve4 } from "node:dns/promises";
const domain = process.argv[2];
try {
  const addresses = await resolve4(domain);
  process.stdout.write([...new Set(addresses)].sort().join(","));
} catch (error) {
  process.stderr.write(`${error?.code || error?.message || "dns_error"}\n`);
  process.exit(3);
}
NODE
} 2>"${CADDY_ROOT}/dns-error.log" || true)"

if [[ ",${RESOLVED_ADDRESSES}," != *",${EXPECTED_IP},"* ]]; then
  detail="DNS A record must point ${DOMAIN} to ${EXPECTED_IP} before TLS can be issued."
  write_status "waiting-for-dns" "${detail}" "${RESOLVED_ADDRESSES}"
  echo "${detail}" >&2
  echo "Resolved now: ${RESOLVED_ADDRESSES:-none}" >&2
  exit 78
fi

ACME_EMAIL_LINE=""
if [[ -n "${PROSMET_ACME_EMAIL:-}" ]]; then
  ACME_EMAIL_LINE="  email ${PROSMET_ACME_EMAIL}"
fi

cat > "${CONFIG_FILE}" <<CADDY
{
  admin 127.0.0.1:2019
  grace_period 10s
${ACME_EMAIL_LINE}
}

${DOMAIN} {
  encode zstd gzip

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    -Server
  }

  reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
    flush_interval -1
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
    header_up X-Real-IP {remote_host}
  }
}

http://${EXPECTED_IP} {
  redir https://${DOMAIN}{uri} 308
}
CADDY
chmod 600 "${CONFIG_FILE}"

XDG_DATA_HOME="${DATA_DIR}" XDG_CONFIG_HOME="${CONFIG_DIR}" \
  "${INSTALLED_BINARY}" validate --config "${CONFIG_FILE}" --adapter caddyfile

stop_pid() {
  local pid="${1:-}"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 0
  kill -0 "${pid}" 2>/dev/null || return 0
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 30); do
    kill -0 "${pid}" 2>/dev/null || return 0
    sleep 0.25
  done
  kill -9 "${pid}" 2>/dev/null || true
}

OWNED_PID=""
if [[ -f "${PID_FILE}" ]]; then
  OWNED_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
fi

for port in 80 443; do
  listeners="$(sudo -n fuser -n tcp "${port}" 2>/dev/null || true)"
  for pid in ${listeners}; do
    [[ "${pid}" =~ ^[0-9]+$ ]] || continue
    if [[ -n "${OWNED_PID}" && "${pid}" == "${OWNED_PID}" ]]; then
      continue
    fi
    command_line="$(tr '\0' ' ' < "/proc/${pid}/cmdline" 2>/dev/null || true)"
    if [[ "${command_line}" == *"${INSTALLED_BINARY}"* && "${command_line}" == *"${CONFIG_FILE}"* ]]; then
      OWNED_PID="${pid}"
      continue
    fi
    write_status "blocked" "Port ${port} is occupied by an unrelated process: ${command_line:-pid ${pid}}" "${RESOLVED_ADDRESSES}"
    echo "Port ${port} is occupied by an unrelated process: ${command_line:-pid ${pid}}" >&2
    exit 1
  done
done

if [[ -n "${OWNED_PID}" ]]; then
  stop_pid "${OWNED_PID}"
fi
rm -f "${PID_FILE}"
: > "${LOG_FILE}"
chmod 600 "${LOG_FILE}"

nohup env \
  RUNNER_TRACKING_ID= \
  XDG_DATA_HOME="${DATA_DIR}" \
  XDG_CONFIG_HOME="${CONFIG_DIR}" \
  "${INSTALLED_BINARY}" run --config "${CONFIG_FILE}" --adapter caddyfile \
  > "${LOG_FILE}" 2>&1 < /dev/null &
CADDY_PID=$!
echo "${CADDY_PID}" > "${PID_FILE}"

for attempt in $(seq 1 90); do
  if curl --fail --silent --show-error \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    "https://${DOMAIN}/api/health" \
    > "${CADDY_ROOT}/public-health.json" 2>"${CADDY_ROOT}/public-health-error.log"; then
    if grep -q '"ok":true' "${CADDY_ROOT}/public-health.json"; then
      break
    fi
  fi
  if ! kill -0 "${CADDY_PID}" 2>/dev/null; then
    tail -n 250 "${LOG_FILE}" >&2 || true
    write_status "failed" "Caddy exited before HTTPS became healthy." "${RESOLVED_ADDRESSES}"
    exit 1
  fi
  if [[ "${attempt}" == "90" ]]; then
    tail -n 250 "${LOG_FILE}" >&2 || true
    cat "${CADDY_ROOT}/public-health-error.log" >&2 2>/dev/null || true
    write_status "failed" "TLS certificate or HTTPS health check did not become ready." "${RESOLVED_ADDRESSES}"
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error --head \
  --resolve "${DOMAIN}:80:127.0.0.1" \
  "http://${DOMAIN}/" \
  > "${CADDY_ROOT}/http-redirect-headers.txt"
grep -Eqi '^HTTP/[^ ]+ (301|302|307|308)' "${CADDY_ROOT}/http-redirect-headers.txt"
grep -Eqi "^location: https://${DOMAIN}/" "${CADDY_ROOT}/http-redirect-headers.txt"

curl --fail --silent --show-error --head \
  --resolve "${DOMAIN}:443:127.0.0.1" \
  "https://${DOMAIN}/" \
  > "${CADDY_ROOT}/https-headers.txt"
grep -Eqi '^strict-transport-security:.*max-age=31536000' "${CADDY_ROOT}/https-headers.txt"

write_status "ready" "Automatic HTTPS reverse proxy is healthy." "${RESOLVED_ADDRESSES}"
echo "Prosmet HTTPS edge is ready at https://${DOMAIN} -> http://127.0.0.1:${UPSTREAM_PORT}"
