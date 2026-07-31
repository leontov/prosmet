#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-${PROSMET_PUBLIC_DOMAIN:-kolibriai.online}}"
UPSTREAM_PORT="${2:-${PROSMET_UPSTREAM_PORT:-3200}}"
EXPECTED_RELEASE_SHA="${PROSMET_EXPECTED_RELEASE_SHA:-${RELEASE_SHA:-${GITHUB_SHA:-}}}"

ROOT="${HOME}/.prosmet/caddy"
CONFIG_FILE="${ROOT}/Caddyfile"
CONFIG_JSON="${ROOT}/Caddyfile.json"
DATA_DIR="${ROOT}/data"
CONFIG_DIR="${ROOT}/config"
LOG_FILE="${ROOT}/caddy.log"
PID_FILE="${ROOT}/caddy.pid"
STATUS_FILE="${ROOT}/status.json"
DIAGNOSTICS_FILE="${ROOT}/edge-diagnostics.txt"
PUBLIC_BODY="${ROOT}/public-health-body.txt"
PUBLIC_HEADERS="${ROOT}/public-health-headers.txt"
LOCAL_TLS_BODY="${ROOT}/local-tls-health-body.txt"
LOCAL_TLS_HEADERS="${ROOT}/local-tls-health-headers.txt"

mkdir -p "${ROOT}" "${DATA_DIR}" "${CONFIG_DIR}"
chmod 700 "${ROOT}" "${DATA_DIR}" "${CONFIG_DIR}"

log() {
  printf '[public-edge] %s\n' "$*"
}

find_caddy() {
  local candidate
  for candidate in \
    "${ROOT}/bin/prosmet-caddy" \
    "/usr/local/bin/prosmet-caddy" \
    "/usr/local/bin/caddy" \
    "/usr/bin/caddy"; do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  command -v caddy 2>/dev/null || return 1
}

CADDY_BINARY="$(find_caddy || true)"
if [[ -z "${CADDY_BINARY}" ]]; then
  echo "No existing Caddy binary is available on Primary." >&2
  exit 1
fi

write_diagnostics() {
  local reason="${1:-unknown}"
  {
    printf 'checked_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'reason=%s\n' "${reason}"
    printf 'domain=%s\n' "${DOMAIN}"
    printf 'upstream_port=%s\n' "${UPSTREAM_PORT}"
    printf 'expected_release_sha=%s\n' "${EXPECTED_RELEASE_SHA:-any}"
    printf 'caddy_binary=%s\n' "${CADDY_BINARY}"
    printf '\n[identity]\n'
    id || true
    printf '\n[dns]\n'
    getent ahostsv4 "${DOMAIN}" 2>&1 || true
    getent ahostsv6 "${DOMAIN}" 2>&1 || true
    printf '\n[listeners]\n'
    ss -H -ltnp 2>&1 | grep -E ':(80|443|2019|3200)\\b' || true
    printf '\n[capabilities]\n'
    getcap "${CADDY_BINARY}" 2>&1 || true
    printf '\n[caddy_admin]\n'
    curl --silent --show-error --max-time 3 http://127.0.0.1:2019/config/ 2>&1 || true
    printf '\n[local_upstream_health]\n'
    curl --silent --show-error --include --max-time 5 \
      "http://127.0.0.1:${UPSTREAM_PORT}/api/health" 2>&1 || true
    printf '\n[local_tls_health]\n'
    curl --insecure --silent --show-error --include --max-time 10 \
      --resolve "${DOMAIN}:443:127.0.0.1" \
      "https://${DOMAIN}/api/health" 2>&1 || true
    printf '\n[public_health]\n'
    curl --silent --show-error --include --max-time 15 \
      "https://${DOMAIN}/api/health" 2>&1 || true
    printf '\n[caddy_log_tail]\n'
    tail -n 160 "${LOG_FILE}" 2>&1 || true
  } > "${DIAGNOSTICS_FILE}"
  chmod 600 "${DIAGNOSTICS_FILE}"
}

health_matches() {
  local body_file="${1:?body file is required}"
  grep -q '"ok":true' "${body_file}" || return 1
  grep -q '"ui":"greenfield"' "${body_file}" || return 1
  if [[ -n "${EXPECTED_RELEASE_SHA}" ]]; then
    grep -q "\"releaseSha\":\"${EXPECTED_RELEASE_SHA}\"" "${body_file}" || return 1
  fi
}

probe_health() {
  local body_file="${1:?body file is required}"
  local headers_file="${2:?headers file is required}"
  shift 2
  local status
  status="$(curl --silent --show-error \
    --connect-timeout 5 --max-time 15 \
    --output "${body_file}" \
    --dump-header "${headers_file}" \
    --write-out '%{http_code}' \
    "$@" || true)"
  [[ "${status}" == "200" ]] || return 1
  health_matches "${body_file}"
}

for attempt in $(seq 1 60); do
  if probe_health "${ROOT}/upstream-health.json" "${ROOT}/upstream-health-headers.txt" \
      "http://127.0.0.1:${UPSTREAM_PORT}/api/health"; then
    break
  fi
  if [[ "${attempt}" == "60" ]]; then
    write_diagnostics "upstream-not-ready"
    echo "The exact application release is not healthy on port ${UPSTREAM_PORT}." >&2
    exit 1
  fi
  sleep 1
done

cat > "${CONFIG_FILE}" <<CADDY
{
  admin 127.0.0.1:2019
  grace_period 10s
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

  @health path /api/health
  handle @health {
    reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
      header_up X-Forwarded-Proto https
      header_up X-Forwarded-Host {host}
      header_up X-Real-IP {remote_host}
    }
  }

  handle {
    reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
      flush_interval -1
      header_up X-Forwarded-Proto https
      header_up X-Forwarded-Host {host}
      header_up X-Real-IP {remote_host}
    }
  }
}
CADDY
chmod 600 "${CONFIG_FILE}"

XDG_DATA_HOME="${DATA_DIR}" XDG_CONFIG_HOME="${CONFIG_DIR}" \
  "${CADDY_BINARY}" validate --config "${CONFIG_FILE}" --adapter caddyfile
XDG_DATA_HOME="${DATA_DIR}" XDG_CONFIG_HOME="${CONFIG_DIR}" \
  "${CADDY_BINARY}" adapt --config "${CONFIG_FILE}" --adapter caddyfile --pretty > "${CONFIG_JSON}"
chmod 600 "${CONFIG_JSON}"

reload_existing_edge() {
  curl --fail --silent --show-error --max-time 3 \
    http://127.0.0.1:2019/config/ >/dev/null 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${CONFIG_JSON}" \
    http://127.0.0.1:2019/load >/dev/null
  log "Loaded the canonical route through the existing Caddy admin API."
}

start_detached_edge() {
  if ss -H -ltn 'sport = :80' 2>/dev/null | grep -q . || \
     ss -H -ltn 'sport = :443' 2>/dev/null | grep -q .; then
    return 1
  fi

  : > "${LOG_FILE}"
  chmod 600 "${LOG_FILE}"
  nohup env -u RUNNER_TRACKING_ID \
    XDG_DATA_HOME="${DATA_DIR}" \
    XDG_CONFIG_HOME="${CONFIG_DIR}" \
    "${CADDY_BINARY}" run --config "${CONFIG_FILE}" --adapter caddyfile \
    </dev/null > "${LOG_FILE}" 2>&1 &
  local pid=$!
  disown "${pid}" 2>/dev/null || true
  printf '%s\n' "${pid}" > "${PID_FILE}"
  sleep 1
  kill -0 "${pid}"
  if tr '\0' '\n' < "/proc/${pid}/environ" | grep -q '^RUNNER_TRACKING_ID='; then
    echo "Detached Caddy still contains RUNNER_TRACKING_ID." >&2
    return 1
  fi
  log "Started a detached Caddy edge with PID ${pid}."
}

if ! reload_existing_edge; then
  if ! start_detached_edge; then
    write_diagnostics "cannot-reload-or-start-edge"
    echo "The existing listener cannot be reconfigured and ports 80/443 are occupied." >&2
    exit 1
  fi
fi

local_tls_ready=false
for attempt in $(seq 1 90); do
  if probe_health "${LOCAL_TLS_BODY}" "${LOCAL_TLS_HEADERS}" \
      --resolve "${DOMAIN}:443:127.0.0.1" \
      "https://${DOMAIN}/api/health"; then
    local_tls_ready=true
    break
  fi
  sleep 1
done
if [[ "${local_tls_ready}" != true ]]; then
  write_diagnostics "local-tls-route-not-ready"
  echo "The local HTTPS edge does not route /api/health to the exact release." >&2
  exit 1
fi

public_ready=false
for attempt in $(seq 1 90); do
  if probe_health "${PUBLIC_BODY}" "${PUBLIC_HEADERS}" \
      "https://${DOMAIN}/api/health"; then
    public_ready=true
    break
  fi
  sleep 2
done
if [[ "${public_ready}" != true ]]; then
  write_diagnostics "public-health-route-not-ready"
  echo "The public HTTPS edge still does not serve the exact /api/health route." >&2
  exit 1
fi

ROOT_STATUS="$(curl --silent --show-error --connect-timeout 5 --max-time 15 \
  --output "${ROOT}/public-root-body.html" \
  --dump-header "${ROOT}/public-root-headers.txt" \
  --write-out '%{http_code}' \
  "https://${DOMAIN}/" || true)"
if [[ "${ROOT_STATUS}" != "200" ]]; then
  write_diagnostics "public-root-not-200"
  echo "The public application root returned HTTP ${ROOT_STATUS}." >&2
  exit 1
fi

grep -Eqi '^strict-transport-security:.*max-age=31536000' "${ROOT}/public-root-headers.txt"

node --input-type=module - \
  "${STATUS_FILE}" "${DOMAIN}" "${UPSTREAM_PORT}" "${EXPECTED_RELEASE_SHA}" "${CADDY_BINARY}" <<'NODE'
import { writeFile } from "node:fs/promises";
const [file, domain, upstreamPort, releaseSha, caddyBinary] = process.argv.slice(2);
await writeFile(file, JSON.stringify({
  state: "ready",
  domain,
  origin: `https://${domain}`,
  upstream: `http://127.0.0.1:${upstreamPort}`,
  releaseSha: releaseSha || null,
  caddyBinary,
  healthRoute: "/api/health",
  checkedAt: new Date().toISOString()
}, null, 2) + "\n", { mode: 0o600 });
NODE

log "Public HTTPS root and /api/health serve the exact release."
