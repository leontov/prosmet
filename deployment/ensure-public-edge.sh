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

UPSTREAM_HEALTH_BODY="${ROOT}/upstream-health.json"
UPSTREAM_HEALTH_HEADERS="${ROOT}/upstream-health-headers.txt"
UPSTREAM_ROOT_BODY="${ROOT}/upstream-root.html"
UPSTREAM_ROOT_HEADERS="${ROOT}/upstream-root-headers.txt"
LOCAL_TLS_HEALTH_BODY="${ROOT}/local-tls-health.json"
LOCAL_TLS_HEALTH_HEADERS="${ROOT}/local-tls-health-headers.txt"
LOCAL_TLS_ROOT_BODY="${ROOT}/local-tls-root.html"
LOCAL_TLS_ROOT_HEADERS="${ROOT}/local-tls-root-headers.txt"
PUBLIC_HEALTH_BODY="${ROOT}/public-health-body.txt"
PUBLIC_HEALTH_HEADERS="${ROOT}/public-health-headers.txt"
PUBLIC_ROOT_BODY="${ROOT}/public-root-body.html"
PUBLIC_ROOT_HEADERS="${ROOT}/public-root-headers.txt"

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

health_matches() {
  local body_file="${1:?body file is required}"
  grep -q '"ok":true' "${body_file}" || return 1
  grep -q '"ui":"greenfield"' "${body_file}" || return 1
  if [[ -n "${EXPECTED_RELEASE_SHA}" ]]; then
    grep -q "\"releaseSha\":\"${EXPECTED_RELEASE_SHA}\"" "${body_file}" || return 1
  fi
}

root_matches() {
  local body_file="${1:?body file is required}"
  grep -Fq '<div id="root"></div>' "${body_file}"
}

probe() {
  local body_file="${1:?body file is required}"
  local headers_file="${2:?headers file is required}"
  local expected="${3:?expected response type is required}"
  shift 3

  local status
  status="$(curl --silent --show-error \
    --connect-timeout 5 --max-time 20 \
    --output "${body_file}" \
    --dump-header "${headers_file}" \
    --write-out '%{http_code}' \
    "$@" || true)"
  [[ "${status}" == "200" ]] || return 1

  case "${expected}" in
    health) health_matches "${body_file}" ;;
    root) root_matches "${body_file}" ;;
    *) echo "Unknown probe type: ${expected}" >&2; return 2 ;;
  esac
}

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
    printf '\n[dns_v4]\n'
    getent ahostsv4 "${DOMAIN}" 2>&1 || true
    printf '\n[dns_v6]\n'
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
    printf '\n[local_upstream_root]\n'
    curl --silent --show-error --include --max-time 5 \
      "http://127.0.0.1:${UPSTREAM_PORT}/" 2>&1 || true
    printf '\n[local_tls_health]\n'
    curl --silent --show-error --include --max-time 10 \
      --resolve "${DOMAIN}:443:127.0.0.1" \
      "https://${DOMAIN}/api/health" 2>&1 || true
    printf '\n[local_tls_root]\n'
    curl --silent --show-error --include --max-time 10 \
      --resolve "${DOMAIN}:443:127.0.0.1" \
      "https://${DOMAIN}/" 2>&1 || true
    printf '\n[public_health]\n'
    curl --silent --show-error --include --max-time 15 \
      "https://${DOMAIN}/api/health" 2>&1 || true
    printf '\n[public_root]\n'
    curl --silent --show-error --include --max-time 15 \
      "https://${DOMAIN}/" 2>&1 || true
    printf '\n[caddy_log_tail]\n'
    tail -n 200 "${LOG_FILE}" 2>&1 || true
  } > "${DIAGNOSTICS_FILE}"
  chmod 600 "${DIAGNOSTICS_FILE}"
}

upstream_ready=false
for attempt in $(seq 1 90); do
  health_ok=false
  root_ok=false
  probe "${UPSTREAM_HEALTH_BODY}" "${UPSTREAM_HEALTH_HEADERS}" health \
    "http://127.0.0.1:${UPSTREAM_PORT}/api/health" && health_ok=true
  probe "${UPSTREAM_ROOT_BODY}" "${UPSTREAM_ROOT_HEADERS}" root \
    "http://127.0.0.1:${UPSTREAM_PORT}/" && root_ok=true
  if [[ "${health_ok}" == true && "${root_ok}" == true ]]; then
    upstream_ready=true
    break
  fi
  sleep 1
done

if [[ "${upstream_ready}" != true ]]; then
  write_diagnostics "upstream-health-or-root-not-ready"
  echo "The exact application release does not serve both / and /api/health on port ${UPSTREAM_PORT}." >&2
  exit 1
fi

# A single reverse_proxy directive is intentional. It is the terminal handler
# for every request path, so neither / nor static assets can fall through to a
# Caddy-generated 404 while /api/health still succeeds.
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

  reverse_proxy 127.0.0.1:${UPSTREAM_PORT} {
    flush_interval -1
    header_up X-Forwarded-Proto https
    header_up X-Forwarded-Host {host}
    header_up X-Real-IP {remote_host}
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
  log "Loaded the all-routes reverse proxy through the existing Caddy admin API."
}

ports_are_free() {
  ! ss -H -ltn 'sport = :80' 2>/dev/null | grep -q . \
    && ! ss -H -ltn 'sport = :443' 2>/dev/null | grep -q .
}

start_detached_edge() {
  ports_are_free || return 1
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
  log "Started a detached all-routes Caddy edge with PID ${pid}."
}

if ! reload_existing_edge; then
  if ! start_detached_edge; then
    write_diagnostics "cannot-reload-or-start-edge"
    echo "The existing HTTPS listener cannot be reconfigured and ports 80/443 are occupied." >&2
    exit 1
  fi
fi

verify_edge_pair() {
  local prefix="${1:?prefix required}"
  shift
  local health_body health_headers root_body root_headers
  health_body="${ROOT}/${prefix}-health-body"
  health_headers="${ROOT}/${prefix}-health-headers"
  root_body="${ROOT}/${prefix}-root-body"
  root_headers="${ROOT}/${prefix}-root-headers"

  probe "${health_body}" "${health_headers}" health "$@" "https://${DOMAIN}/api/health" \
    && probe "${root_body}" "${root_headers}" root "$@" "https://${DOMAIN}/"
}

local_ready=false
for attempt in $(seq 1 90); do
  if probe "${LOCAL_TLS_HEALTH_BODY}" "${LOCAL_TLS_HEALTH_HEADERS}" health \
      --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health" \
    && probe "${LOCAL_TLS_ROOT_BODY}" "${LOCAL_TLS_ROOT_HEADERS}" root \
      --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/"; then
    local_ready=true
    break
  fi
  if (( attempt % 15 == 0 )); then reload_existing_edge || true; fi
  sleep 1
done

if [[ "${local_ready}" != true ]]; then
  write_diagnostics "local-tls-health-or-root-not-ready"
  echo "The local HTTPS edge does not serve both / and /api/health from the exact release." >&2
  exit 1
fi

public_ready=false
for attempt in $(seq 1 90); do
  if probe "${PUBLIC_HEALTH_BODY}" "${PUBLIC_HEALTH_HEADERS}" health \
      "https://${DOMAIN}/api/health" \
    && probe "${PUBLIC_ROOT_BODY}" "${PUBLIC_ROOT_HEADERS}" root \
      "https://${DOMAIN}/"; then
    public_ready=true
    break
  fi
  if (( attempt % 15 == 0 )); then reload_existing_edge || true; fi
  sleep 2
done

if [[ "${public_ready}" != true ]]; then
  write_diagnostics "public-health-or-root-not-ready"
  echo "The public HTTPS edge does not serve both / and /api/health from the exact release." >&2
  exit 1
fi

grep -Eqi '^strict-transport-security:.*max-age=31536000' "${PUBLIC_ROOT_HEADERS}"

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
  routeMode: "single-terminal-reverse-proxy",
  verifiedPaths: ["/", "/api/health"],
  checkedAt: new Date().toISOString()
}, null, 2) + "\n", { mode: 0o600 });
NODE

log "Public HTTPS root and /api/health serve the exact release through one terminal reverse proxy."
