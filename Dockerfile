FROM node:22.16.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

FROM node:22.16.0-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22.16.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3100
RUN groupadd --system --gid 1001 prosmet && useradd --system --uid 1001 --gid prosmet prosmet
COPY --from=builder --chown=prosmet:prosmet /app/.next/standalone ./
COPY --from=builder --chown=prosmet:prosmet /app/.next/static ./.next/static
COPY --from=builder --chown=prosmet:prosmet /app/public ./public
USER prosmet
EXPOSE 3100
CMD ["node", "server.js"]
