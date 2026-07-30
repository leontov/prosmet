#!/usr/bin/env bash
set -u

OUTPUT="${1:-artifacts/https/host-capabilities.txt}"
mkdir -p "$(dirname "${OUTPUT}")"

exec > >(tee "${OUTPUT}") 2>&1

section() {
  printf '\n===== %s =====\n' "$1"
}

safe_command() {
  printf '$'
  printf ' %q' "$@"
  printf '\n'
  "$@" 2>&1 || true
}

section "identity"
date -u +%Y-%m-%dT%H:%M:%SZ
safe_command id
safe_command groups
safe_command uname -a
printf 'cwd=%s\n' "$(pwd)"
printf 'home=%s\n' "${HOME:-unset}"
printf 'shell=%s\n' "${SHELL:-unset}"

section "kernel low-port policy"
if [[ -r /proc/sys/net/ipv4/ip_unprivileged_port_start ]]; then
  printf 'net.ipv4.ip_unprivileged_port_start='
  cat /proc/sys/net/ipv4/ip_unprivileged_port_start
fi
if [[ -r /proc/self/status ]]; then
  grep -E '^(Uid|Gid|Groups|Cap(Inh|Prm|Eff|Bnd|Amb)|NoNewPrivs|Seccomp):' /proc/self/status || true
fi
command -v capsh >/dev/null 2>&1 && safe_command capsh --print

section "socket bind probes"
node --input-type=module <<'NODE'
import net from "node:net";

for (const port of [80, 443, 2019, 8080, 8443]) {
  await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      console.log(JSON.stringify({ port, bind: "failed", code: error.code, message: error.message }));
      resolve();
    });
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      const address = server.address();
      console.log(JSON.stringify({ port, bind: "ok", address }));
      server.close(() => resolve());
    });
  });
}
NODE

section "listeners"
if command -v ss >/dev/null 2>&1; then
  ss -H -ltnp 2>&1 | tee /tmp/prosmet-https-listeners.txt || true
  mapfile -t listener_pids < <(grep -oE 'pid=[0-9]+' /tmp/prosmet-https-listeners.txt 2>/dev/null | cut -d= -f2 | sort -u)
  for pid in "${listener_pids[@]:-}"; do
    [[ "${pid}" =~ ^[0-9]+$ ]] || continue
    printf '\n--- listener pid=%s ---\n' "${pid}"
    ps -o pid=,ppid=,user=,group=,comm= -p "${pid}" 2>/dev/null || true
    readlink -f "/proc/${pid}/exe" 2>/dev/null | sed 's/^/exe=/' || true
    readlink -f "/proc/${pid}/cwd" 2>/dev/null | sed 's/^/cwd=/' || true
    grep -E '^(Name|Uid|Gid|CapEff|NoNewPrivs):' "/proc/${pid}/status" 2>/dev/null || true
  done
else
  echo "ss unavailable"
fi

section "edge binaries and file capabilities"
for candidate in \
  /usr/local/bin/prosmet-caddy \
  /usr/local/bin/caddy \
  /usr/bin/caddy \
  /usr/sbin/nginx \
  /usr/bin/nginx \
  /usr/sbin/apache2 \
  /usr/sbin/httpd \
  /usr/sbin/haproxy \
  /usr/bin/traefik \
  "${HOME:-/nonexistent}/.prosmet/caddy/bin/prosmet-caddy"; do
  [[ -e "${candidate}" ]] || continue
  ls -l "${candidate}" 2>/dev/null || true
  command -v getcap >/dev/null 2>&1 && getcap "${candidate}" 2>/dev/null || true
  "${candidate}" version 2>/dev/null | head -n 2 || \
    "${candidate}" --version 2>/dev/null | head -n 2 || true
done

for name in caddy nginx apache2 httpd haproxy traefik authbind docker podman systemctl sudo doas setcap getcap; do
  path="$(command -v "${name}" 2>/dev/null || true)"
  printf '%-12s %s\n' "${name}" "${path:-missing}"
done

section "service discovery"
if command -v systemctl >/dev/null 2>&1; then
  for unit in caddy.service nginx.service apache2.service haproxy.service traefik.service; do
    printf '\n--- %s ---\n' "${unit}"
    systemctl show "${unit}" \
      --property=LoadState,ActiveState,SubState,UnitFileState,FragmentPath,ExecStart \
      --no-pager 2>&1 || true
  done
fi

section "configuration surfaces"
for root in /etc/caddy /etc/nginx /etc/apache2 /etc/haproxy /etc/traefik; do
  [[ -e "${root}" ]] || continue
  printf '\n--- %s ---\n' "${root}"
  ls -ld "${root}" 2>/dev/null || true
  find "${root}" -maxdepth 3 -type f -printf '%M %u:%g %p\n' 2>/dev/null | sort | head -n 250 || true
  grep -RIl --exclude='*.key' --exclude='*.pem' --exclude='*.crt' -- 'kolibriai\.online' "${root}" 2>/dev/null | sed 's/^/domain-config=/' || true
done

section "Caddy admin API probes"
for url in http://127.0.0.1:2019/config/ http://127.0.0.1:2019/id/; do
  printf '%s status=' "${url}"
  curl --silent --show-error --max-time 3 --output /dev/null --write-out '%{http_code}\n' "${url}" 2>&1 || true
done

section "privilege adapters"
if command -v sudo >/dev/null 2>&1; then
  safe_command sudo -n true
  safe_command sudo -n -l
fi
if command -v doas >/dev/null 2>&1; then
  safe_command doas -n true
fi
if command -v authbind >/dev/null 2>&1; then
  ls -la /etc/authbind/byport 2>/dev/null || true
fi

section "container adapters"
if command -v docker >/dev/null 2>&1; then
  safe_command docker info --format '{{json .ServerVersion}}'
  if [[ -S /var/run/docker.sock ]]; then
    ls -l /var/run/docker.sock || true
  fi
fi
if command -v podman >/dev/null 2>&1; then
  safe_command podman info --format json
fi

section "network and DNS"
safe_command getent ahostsv4 "${PROSMET_PUBLIC_DOMAIN:-kolibriai.online}"
for port in 80 443 3200; do
  printf '127.0.0.1:%s ' "${port}"
  timeout 2 bash -c "</dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1 && echo open || echo closed
done

section "diagnostic complete"
echo "No secrets or environment values were collected."
