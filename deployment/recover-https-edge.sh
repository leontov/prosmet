#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${1:-${PROSMET_PUBLIC_DOMAIN:-kolibriai.online}}"
UPSTREAM_PORT="${2:-3200}"
if [[ -v PROSMET_EXPECTED_RELEASE_SHA ]]; then
  EXPECTED_RELEASE_SHA="${PROSMET_EXPECTED_RELEASE_SHA}"
else
  EXPECTED_RELEASE_SHA="${GITHUB_SHA:-}"
fi

ROOT="${HOME}/.prosmet"
CADDY_ROOT="${ROOT}/caddy"
USER_BINARY="${CADDY_ROOT}/bin/prosmet-caddy"
CONFIG_FILE="${CADDY_ROOT}/Caddyfile"
CONFIG_JSON="${CADDY_ROOT}/Caddyfile.json"
DATA_DIR="${CADDY_ROOT}/data"
CONFIG_DIR="${CADDY_ROOT}/config"
PID_FILE="${CADDY_ROOT}/caddy.pid"
MODE_FILE="${CADDY_ROOT}/runtime-mode"
LOG_FILE="${CADDY_ROOT}/caddy.log"
STATUS_FILE="${CADDY_ROOT}/status.json"
DIAGNOSTICS_FILE="${CADDY_ROOT}/privilege-diagnostics.txt"
HEALTH_FILE="${CADDY_ROOT}/public-health.json"
CURRENT_UID="$(id -u)"
CURRENT_USER="$(id -un 2>/dev/null || printf 'uid-%s' "${CURRENT_UID}")"

mkdir -p "${CADDY_ROOT}/bin" "${DATA_DIR}" "${CONFIG_DIR}"
chmod 700 "${ROOT}" "${CADDY_ROOT}" "${CADDY_ROOT}/bin" "${DATA_DIR}" "${CONFIG_DIR}"

log() {
  printf '[https-recovery] %s\n' "$*"
}

record_diagnostics() {
  {
    printf 'checked_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'domain=%s\n' "${DOMAIN}"
    printf 'upstream_port=%s\n' "${UPSTREAM_PORT}"
    printf 'expected_release_sha=%s\n' "${EXPECTED_RELEASE_SHA:-any}"
    printf 'uid=%s\n' "${CURRENT_UID}"
    printf 'user=%s\n' "${CURRENT_USER}"
    printf 'low_port_start=%s\n' "$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || printf unknown)"
    printf '\n[id]\n'
    id || true
    printf '\n[commands]\n'
    for command_name in sudo setcap getcap sysctl systemd-run systemctl caddy docker authbind; do
      printf '%s=%s\n' "${command_name}" "$(command -v "${command_name}" 2>/dev/null || printf missing)"
    done
    printf '\n[sudo_noninteractive_rules]\n'
    sudo -n -l 2>&1 || true
    printf '\n[file_capabilities]\n'
    getcap "${USER_BINARY}" /usr/bin/caddy /usr/local/bin/caddy /usr/local/bin/prosmet-caddy 2>/dev/null || true
    printf '\n[listeners]\n'
    ss -H -ltnp 2>&1 | grep -E ':(80|443|2019|3200)\b' || true
    printf '\n[network]\n'
    ip -brief address 2>&1 || true
    ip route 2>&1 || true
    printf '\n[caddy_admin]\n'
    curl --silent --show-error --max-time 3 http://127.0.0.1:2019/config/ 2>&1 || true
  } > "${DIAGNOSTICS_FILE}"
  chmod 600 "${DIAGNOSTICS_FILE}"
}

internal_release_ready() {
  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:${UPSTREAM_PORT}/api/health" > "${CADDY_ROOT}/internal-health.json" \
    || return 1
  grep -q '"ok":true' "${CADDY_ROOT}/internal-health.json" || return 1
  if [[ -n "${EXPECTED_RELEASE_SHA}" ]]; then
    grep -q "\"releaseSha\":\"${EXPECTED_RELEASE_SHA}\"" "${CADDY_ROOT}/internal-health.json"
  fi
}

for attempt in $(seq 1 300); do
  if internal_release_ready; then
    break
  fi
  if [[ "${attempt}" == "300" ]]; then
    echo "Exact internal release did not become ready on 127.0.0.1:${UPSTREAM_PORT}." >&2
    exit 1
  fi
  sleep 2
done

# First let the canonical provisioner use any capability that is already present.
if bash deployment/provision-https.sh "${DOMAIN}" "${UPSTREAM_PORT}"; then
  exit 0
fi

record_diagnostics

if [[ ! -x "${USER_BINARY}" ]]; then
  echo "Caddy binary was not materialized by deployment/provision-https.sh." >&2
  exit 1
fi

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
  "${USER_BINARY}" validate --config "${CONFIG_FILE}" --adapter caddyfile
XDG_DATA_HOME="${DATA_DIR}" XDG_CONFIG_HOME="${CONFIG_DIR}" \
  "${USER_BINARY}" adapt --config "${CONFIG_FILE}" --adapter caddyfile --pretty > "${CONFIG_JSON}"
chmod 600 "${CONFIG_JSON}"

public_edge_ready() {
  curl --fail --silent --show-error --max-time 10 \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    "https://${DOMAIN}/api/health" > "${HEALTH_FILE}" \
    || return 1
  grep -q '"ok":true' "${HEALTH_FILE}" || return 1
  if [[ -n "${EXPECTED_RELEASE_SHA}" ]]; then
    grep -q "\"releaseSha\":\"${EXPECTED_RELEASE_SHA}\"" "${HEALTH_FILE}"
  fi
}

wait_for_public_edge() {
  for attempt in $(seq 1 120); do
    if public_edge_ready; then
      return 0
    fi
    sleep 2
  done
  return 1
}

write_ready_evidence() {
  local mode="${1:?mode is required}"
  curl --silent --show-error --head \
    --resolve "${DOMAIN}:80:127.0.0.1" \
    "http://${DOMAIN}/" > "${CADDY_ROOT}/http-redirect-headers.txt"
  grep -Eqi '^HTTP/[^ ]+ (301|302|307|308)' "${CADDY_ROOT}/http-redirect-headers.txt"
  grep -Eqi "^location: https://${DOMAIN}/" "${CADDY_ROOT}/http-redirect-headers.txt"
  curl --fail --silent --show-error --head \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    "https://${DOMAIN}/" > "${CADDY_ROOT}/https-headers.txt"
  grep -Eqi '^strict-transport-security:.*max-age=31536000' "${CADDY_ROOT}/https-headers.txt"
  printf '%s\n' "${mode}" > "${MODE_FILE}"
  node --input-type=module - \
    "${STATUS_FILE}" "${DOMAIN}" "${UPSTREAM_PORT}" "${mode}" "${EXPECTED_RELEASE_SHA}" <<'NODE'
import { writeFile } from "node:fs/promises";
const [file, domain, upstreamPort, runtimeMode, releaseSha] = process.argv.slice(2);
await writeFile(file, JSON.stringify({
  state: "ready",
  detail: "Automatic HTTPS reverse proxy is healthy.",
  domain,
  origin: `https://${domain}`,
  upstream: `http://127.0.0.1:${upstreamPort}`,
  runtimeMode,
  releaseSha: releaseSha || null,
  checkedAt: new Date().toISOString()
}, null, 2) + "\n", { mode: 0o600 });
NODE
  log "HTTPS edge is ready via ${mode}."
}

try_existing_caddy_admin() {
  curl --fail --silent --show-error --max-time 3 \
    http://127.0.0.1:2019/config/ >/dev/null 2>&1 || return 1
  curl --fail --silent --show-error --max-time 10 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data-binary "@${CONFIG_JSON}" \
    http://127.0.0.1:2019/load >/dev/null
  wait_for_public_edge
}

if try_existing_caddy_admin; then
  write_ready_evidence "existing-caddy-admin"
  exit 0
fi

has_bind_capability() {
  local binary="${1:?binary is required}"
  command -v getcap >/dev/null 2>&1 || return 1
  getcap "${binary}" 2>/dev/null | grep -q 'cap_net_bind_service'
}

stop_previous_user_edge() {
  local previous_mode previous_pid
  previous_mode="$(cat "${MODE_FILE}" 2>/dev/null || true)"
  previous_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if [[ "${previous_mode}" == host-* && "${previous_pid}" =~ ^[0-9]+$ ]]; then
    kill "${previous_pid}" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "${previous_pid}" 2>/dev/null || break
      sleep 0.25
    done
  fi
}

ports_are_free() {
  for port in 80 443; do
    if ss -H -ltn "sport = :${port}" 2>/dev/null | grep -q .; then
      return 1
    fi
  done
}

start_user_edge() {
  local mode="${1:?mode is required}"
  stop_previous_user_edge
  ports_are_free || return 1
  : > "${LOG_FILE}"
  chmod 600 "${LOG_FILE}"
  nohup env \
    RUNNER_TRACKING_ID= \
    XDG_DATA_HOME="${DATA_DIR}" \
    XDG_CONFIG_HOME="${CONFIG_DIR}" \
    "${USER_BINARY}" run --config "${CONFIG_FILE}" --adapter caddyfile \
    > "${LOG_FILE}" 2>&1 < /dev/null &
  local pid=$!
  printf '%s\n' "${pid}" > "${PID_FILE}"
  printf '%s\n' "${mode}" > "${MODE_FILE}"
  if ! wait_for_public_edge; then
    tail -n 250 "${LOG_FILE}" >&2 || true
    return 1
  fi
  write_ready_evidence "${mode}"
}

SETCAP_BIN="$(command -v setcap 2>/dev/null || true)"
if [[ -n "${SETCAP_BIN}" ]]; then
  if sudo -n "${SETCAP_BIN}" 'cap_net_bind_service=+ep' "${USER_BINARY}" \
      >> "${DIAGNOSTICS_FILE}" 2>&1 || \
     sudo -n setcap 'cap_net_bind_service=+ep' "${USER_BINARY}" \
      >> "${DIAGNOSTICS_FILE}" 2>&1; then
    if has_bind_capability "${USER_BINARY}" && start_user_edge "host-sudo-setcap"; then
      exit 0
    fi
  fi
fi

SYSCTL_BIN="$(command -v sysctl 2>/dev/null || true)"
if [[ -n "${SYSCTL_BIN}" ]]; then
  if sudo -n "${SYSCTL_BIN}" -w net.ipv4.ip_unprivileged_port_start=80 \
      >> "${DIAGNOSTICS_FILE}" 2>&1 || \
     sudo -n sysctl -w net.ipv4.ip_unprivileged_port_start=80 \
      >> "${DIAGNOSTICS_FILE}" 2>&1; then
    LOW_PORT_START="$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || printf 1024)"
    if [[ "${LOW_PORT_START}" =~ ^[0-9]+$ ]] && (( LOW_PORT_START <= 80 )) && \
       start_user_edge "host-sudo-low-port-sysctl"; then
      exit 0
    fi
  fi
fi

# Some hardened runners allow starting a pre-approved root process but not
# arbitrary package installation. Try Caddy itself and systemd-run narrowly.
if sudo -n env \
    RUNNER_TRACKING_ID= \
    XDG_DATA_HOME="${DATA_DIR}" \
    XDG_CONFIG_HOME="${CONFIG_DIR}" \
    "${USER_BINARY}" start --config "${CONFIG_FILE}" --adapter caddyfile \
    >> "${DIAGNOSTICS_FILE}" 2>&1; then
  if wait_for_public_edge; then
    write_ready_evidence "sudo-caddy-start"
    exit 0
  fi
fi

SYSTEMD_RUN_BIN="$(command -v systemd-run 2>/dev/null || true)"
if [[ -n "${SYSTEMD_RUN_BIN}" ]]; then
  UNIT_NAME="prosmet-caddy-edge-${GITHUB_RUN_ID:-manual}"
  if sudo -n "${SYSTEMD_RUN_BIN}" \
      --unit="${UNIT_NAME}" \
      --property=Restart=always \
      --property=RestartSec=2s \
      --setenv="XDG_DATA_HOME=${DATA_DIR}" \
      --setenv="XDG_CONFIG_HOME=${CONFIG_DIR}" \
      "${USER_BINARY}" run --config "${CONFIG_FILE}" --adapter caddyfile \
      >> "${DIAGNOSTICS_FILE}" 2>&1; then
    if wait_for_public_edge; then
      write_ready_evidence "sudo-systemd-run"
      exit 0
    fi
  fi
fi

record_diagnostics
cat "${DIAGNOSTICS_FILE}" >&2
write_ready_evidence "unreachable" >/dev/null 2>&1 || true
node --input-type=module - "${STATUS_FILE}" "${DOMAIN}" "${UPSTREAM_PORT}" <<'NODE'
import { writeFile } from "node:fs/promises";
const [file, domain, upstreamPort] = process.argv.slice(2);
await writeFile(file, JSON.stringify({
  state: "blocked",
  detail: "The runner has no non-interactive capability to bind host ports 80/443.",
  domain,
  upstream: `http://127.0.0.1:${upstreamPort}`,
  requiredOperatorAction: "sudo setcap cap_net_bind_service=+ep $HOME/.prosmet/caddy/bin/prosmet-caddy",
  checkedAt: new Date().toISOString()
}, null, 2) + "\n", { mode: 0o600 });
NODE
exit 1
