---
applyTo: "app/api/**/*.ts,lib/server/**/*.ts,deployment/**/*.sh,deployment/**/*.mjs"
---

# Backend, data, providers и infrastructure

- Любой read/write owner/tenant scoped; request ID не является разрешением.
- PostgreSQL — canonical server state; migration идемпотентна и backward-compatible.
- Не добавляй browser SQL/WASM или server persistence, расходящуюся с PostgreSQL.
- Private/runtime endpoints используют `no-store`.
- Вход валидируется, request size ограничен, ошибки имеют стабильный code и не раскрывают stack/secret.
- Секреты остаются server-side, шифруются/выдаются как references и не попадают в browser, AG-UI/A2A, logs или artifacts.
- Provider selection explicit; silent fallback запрещён.
- Timeout/cancel signal проходит до provider/worker.
- Service recovery/settings остаются доступны при outage внешнего provider.
- A2A task owner/repository/environment scoped, идемпотентен и аудируем.
- Write/git/deploy выполняются через узкие capability adapters, а не общий production shell.
- Production internal app слушает `127.0.0.1:3200` за Caddy edge.
- Canonical origin — `https://kolibriai.online`; secure cookie определяется через доверенный proxy protocol.
- HTTP redirect, TLS, HSTS и public exact-SHA проверяются в release workflow.
- Новый release immutable и не заменяет healthy process до database/health probes.
- Rollback target и migration compatibility определяются до production deploy.
