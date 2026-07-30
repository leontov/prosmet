# Просметчик: инструкции для агентной разработки

Этот каталог — единая точка входа для всех ИИ-агентов, которые проектируют, изменяют, проверяют, выпускают и поддерживают `leontov/prosmet`.

## Порядок чтения

1. [`../../AGENTS.md`](../../AGENTS.md) — обязательные правила репозитория и критерии завершения.
2. [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — продукт, пользователи, цели и текущий критический путь.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — границы frontend, backend, данных, AG-UI и A2A.
4. [`EXECUTION_PROTOCOL.md`](EXECUTION_PROTOCOL.md) — как агент должен вести задачу от запроса до production.
5. [`UX_PRODUCT_RULES.md`](UX_PRODUCT_RULES.md) — mobile/desktop UX, сметы, документы и цены.
6. [`QUALITY_RELEASE_GATE.md`](QUALITY_RELEASE_GATE.md) — обязательные проверки и exact-SHA deploy.
7. [`A2A_ROLES.md`](A2A_ROLES.md) — роли команды агентов, артефакты и передача задач.
8. [`SECURITY_PERMISSIONS.md`](SECURITY_PERMISSIONS.md) — права, секреты, tenancy, sandbox и approvals.
9. [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) — диагностика Primary, PostgreSQL, HTTPS и rollback.

## Главный принцип

Внутренняя работа не равна результату. Коммиты, планы, тесты, отчёты и скриншоты считаются промежуточными артефактами. Задача завершена только тогда, когда проверенный exact SHA развёрнут, живой пользовательский сценарий проходит на `https://kolibriai.online`, а `Prosmet Main Production` завершён со статусом `MAIN PRODUCTION PASS`.

## Source of truth

- Репозиторий: `leontov/prosmet`.
- Production branch: `main`.
- Production runner: `prosmet-primary`.
- Внутренний процесс приложения: `127.0.0.1:3200`.
- Канонический origin: `https://kolibriai.online`.
- Server database: PostgreSQL.
- Browser local-first cache: IndexedDB.
- Chat runtime: один assistant-ui runtime.
- Frontend ↔ agent transport: AG-UI/SSE.
- Agent-to-agent coordination: A2A с owner-scoped задачами и явными правами.

Любой документ, который противоречит этому набору инструкций, считается историческим до явного решения владельца изменить source of truth.
