# Полная карта инструкций агентной разработки

## Корневые правила

- `/AGENTS.md` — обязательные правила репозитория.
- `/AGENT_DEVELOPMENT_INSTRUCTIONS.md` — краткая точка входа.
- `/.github/copilot-instructions.md` — repository-wide coding-agent policy.
- `/docs/agents/INSTRUCTION_MANIFEST.json` — машинный порядок загрузки.

## Продукт и архитектура

- `/docs/agents/PROJECT_CONTEXT.md` — продукт, роли, две пользовательские боли и critical path.
- `/docs/agents/ARCHITECTURE.md` — assistant-ui, AG-UI, PostgreSQL, IndexedDB, documents, prices, A2A и production topology.
- `/docs/agents/UX_PRODUCT_RULES.md` — premium desktop/mobile UX, локализация, accessibility и performance.
- `/docs/agents/CODE_CONVENTIONS.md` — TypeScript, React, domain, API, CSS, sync, tests и Git.

## Выполнение и выпуск

- `/docs/agents/EXECUTION_PROTOCOL.md` — задача от наблюдаемой цели до production.
- `/docs/agents/QUALITY_RELEASE_GATE.md` — source/type/unit/build/E2E/security/a11y/visual/performance/HTTPS exact-SHA gate.
- `/docs/agents/OPERATIONS_RUNBOOK.md` — Primary, PostgreSQL, Caddy, DNS, browser defects и rollback.

## Агентная фабрика и безопасность

- `/docs/agents/A2A_ROLES.md` — роли, Task lifecycle, permission ladder, artifacts и reducer.
- `/docs/agents/SECURITY_PERMISSIONS.md` — trust boundaries, tenancy, secrets, capability gateway, approvals и incident response.
- `/docs/agents/AGENT_BOOTSTRAP_PROMPT.md` — готовое стартовое задание новому агенту.

## Path-specific инструкции

- `/.github/instructions/frontend.instructions.md` — app/components/local-first UI.
- `/.github/instructions/domain.instructions.md` — сметы, цены, revisions, documents и exports.
- `/.github/instructions/backend.instructions.md` — API, PostgreSQL, providers, A2A и deployment.
- `/.github/instructions/testing.instructions.md` — tests, contracts и production gate.

## Шаблоны управления разработкой

- `/.github/PULL_REQUEST_TEMPLATE.md` — evidence-driven PR.
- `/.github/ISSUE_TEMPLATE/agent-task.yml` — owner-scoped A2A-задача.

## Технические контракты

- `/scripts/agent-project-instructions-contract.mjs` — обязательное наличие и ключевые инварианты instruction pack.
- `/scripts/https-premium-foundation-contract.mjs` — HTTPS/UX Premium foundation.
- остальные scripts contracts защищают runtime, data, providers, prices, PDF и A2A.

## Текущий release constraint

`PROSMET UX PREMIUM FOUNDATION V1` не добавляет новые продуктовые модули. Допустимы только изменения, необходимые для:

- `https://kolibriai.online`;
- удаления runtime/console ошибок;
- adaptive shell;
- исправления обрезаний;
- русской локализации;
- business action separation;
- keyboard-safe mobile editing;
- WCAG/visual/performance gates;
- exact-SHA production PASS.

## Универсальное завершение

```text
current main SHA
        ==
https://kolibriai.online/api/health.releaseSha

Prosmet Main Production == success
MAIN PRODUCTION PASS published
live desktop HTTPS critical path == PASS
live mobile HTTPS critical path == PASS
```

Без этого агент сообщает `FAILED` или `BLOCKED`, но не `DONE`.
