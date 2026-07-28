#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-primary}"
IMAGE="${2:?usage: primary-stack.sh <canary|primary> <image> [port]}"
PUBLIC_PORT="${3:-3200}"
ROOT="/opt/prosmet"
NETWORK="prosmet-net"
POSTGRES_CONTAINER="prosmet-postgres"
POSTGRES_VOLUME="prosmet-postgres-data"
APP_CONTAINER="prosmet"
BIND_ADDRESS="0.0.0.0"

if [[ "$MODE" == "canary" ]]; then
  APP_CONTAINER="prosmet-canary"
  PUBLIC_PORT="13100"
  BIND_ADDRESS="127.0.0.1"
fi

mkdir -p "$ROOT"
chmod 750 "$ROOT"

if [[ ! -f "$ROOT/postgres.password" ]]; then
  umask 077
  openssl rand -hex 36 > "$ROOT/postgres.password"
fi
POSTGRES_PASSWORD="$(tr -d '\r\n' < "$ROOT/postgres.password")"

if [[ ! -f "$ROOT/app.secret" ]]; then
  umask 077
  openssl rand -hex 48 > "$ROOT/app.secret"
fi
APP_SECRET="$(tr -d '\r\n' < "$ROOT/app.secret")"

if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
  docker network create "$NETWORK" >/dev/null
fi

docker volume inspect "$POSTGRES_VOLUME" >/dev/null 2>&1 || \
  docker volume create "$POSTGRES_VOLUME" >/dev/null

if ! docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
  docker run -d \
    --name "$POSTGRES_CONTAINER" \
    --restart unless-stopped \
    --network "$NETWORK" \
    -e POSTGRES_DB=prosmet \
    -e POSTGRES_USER=prosmet \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -v "$POSTGRES_VOLUME:/var/lib/postgresql/data" \
    --health-cmd='pg_isready -U prosmet -d prosmet' \
    --health-interval=5s \
    --health-timeout=5s \
    --health-retries=20 \
    postgres:16-alpine >/dev/null
else
  docker start "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
fi

for attempt in $(seq 1 40); do
  if [[ "$(docker inspect -f '{{.State.Health.Status}}' "$POSTGRES_CONTAINER" 2>/dev/null || true)" == "healthy" ]]; then
    break
  fi
  if [[ "$attempt" == "40" ]]; then
    docker logs "$POSTGRES_CONTAINER" || true
    echo "PostgreSQL did not become healthy" >&2
    exit 1
  fi
  sleep 2
done

cat > "$ROOT/runtime.env" <<ENV
NODE_ENV=production
NEXT_PUBLIC_AGUI_AGENT_URL=/api/agent
PROSMET_DEFAULT_PROVIDER=${PROSMET_DEFAULT_PROVIDER:-rules}
PROSMET_SESSION_SECRET=${PROSMET_SESSION_SECRET:-$APP_SECRET}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET:-$APP_SECRET}
DATABASE_URL=postgresql://prosmet:${POSTGRES_PASSWORD}@${POSTGRES_CONTAINER}:5432/prosmet
PROSMET_AGENT_MAX_REQUEST_BYTES=${PROSMET_AGENT_MAX_REQUEST_BYTES:-16777216}
ENV

for optional_name in \
  MIMO_API_KEY MIMO_BASE_URL MIMO_MODEL \
  OPENAI_COMPATIBLE_API_KEY OPENAI_COMPATIBLE_BASE_URL OPENAI_COMPATIBLE_MODEL \
  OLLAMA_BASE_URL OLLAMA_MODEL; do
  optional_value="${!optional_name:-}"
  if [[ -n "$optional_value" ]]; then
    printf '%s=%s\n' "$optional_name" "$optional_value" >> "$ROOT/runtime.env"
  fi
done
chmod 600 "$ROOT/runtime.env"

docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true

docker run -d \
  --name "$APP_CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK" \
  --env-file "$ROOT/runtime.env" \
  -p "${BIND_ADDRESS}:${PUBLIC_PORT}:3100" \
  --health-cmd='node -e "fetch(\"http://127.0.0.1:3100/api/health\").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"' \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=15 \
  "$IMAGE" >/dev/null

BASE_URL="http://127.0.0.1:${PUBLIC_PORT}"
for attempt in $(seq 1 40); do
  if curl -fsS "$BASE_URL/api/health" > "$ROOT/${APP_CONTAINER}-health.json"; then
    if curl -fsS "$BASE_URL/api/backend/status" > "$ROOT/${APP_CONTAINER}-backend.json"; then
      if grep -q '"connected":true' "$ROOT/${APP_CONTAINER}-backend.json"; then
        break
      fi
    fi
  fi
  if [[ "$attempt" == "40" ]]; then
    docker logs "$APP_CONTAINER" || true
    echo "Prosmet frontend/backend did not become healthy" >&2
    exit 1
  fi
  sleep 2
done

curl --fail --silent --show-error --no-buffer --max-time 45 \
  -H 'content-type: application/json' \
  -H 'accept: text/event-stream' \
  -d '{"threadId":"deployment-probe","runId":"deployment-probe","messages":[{"id":"probe-user","role":"user","content":[{"type":"text","text":"Проверка backend Просметчика"}]}],"tools":[],"context":{},"state":{}}' \
  "$BASE_URL/api/agent" > "$ROOT/${APP_CONTAINER}-agent.sse"

grep -q '"type":"RUN_STARTED"' "$ROOT/${APP_CONTAINER}-agent.sse"
grep -q '"type":"TEXT_MESSAGE_CONTENT"' "$ROOT/${APP_CONTAINER}-agent.sse"
grep -q '"type":"RUN_FINISHED"' "$ROOT/${APP_CONTAINER}-agent.sse"

cat "$ROOT/${APP_CONTAINER}-health.json"
echo
cat "$ROOT/${APP_CONTAINER}-backend.json"
echo
printf 'Prosmet %s is healthy on %s\n' "$MODE" "$BASE_URL"
