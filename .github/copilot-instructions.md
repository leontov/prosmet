# GitHub Copilot instructions — Просметчик

Перед любым изменением обязательно прочитай `/AGENTS.md`.

Затем загрузи:

1. `/docs/PROJECT_SOURCE_OF_TRUTH.md`;
2. `/docs/AGENT_CONTEXT_INDEX.md`;
3. `/docs/AGENT_ENGINEERING_PLAYBOOK.md`;
4. релевантные product/UX/A2A contracts;
5. `/docs/WRITE_ACTIONS_RECOVERY.md`, если GitHub write-actions недоступны.

## Неизменяемый контекст

- Repository: `leontov/prosmet`.
- Production branch: `main`.
- Production runner: `prosmet-primary`.
- Internal app: `127.0.0.1:3200`.
- Public app: `https://kolibriai.online`.
- Completion: только `MAIN PRODUCTION PASS` exact main SHA.

## Архитектура

- `assistant-ui` — единственный chat runtime.
- `AG-UI` — единственный streaming transport.
- PostgreSQL — server source of truth.
- IndexedDB — browser cache/offline outbox.
- Browser SQLite/SQL.js/PGlite/WASM/eval запрещены.
- Технологическая карта создаётся до сметы.
- Итог сметы считает deterministic engine.
- Служебные artifacts хранятся в background state; пользователь видит compact result card.
- Secrets никогда не возвращаются в client, messages, artifacts или logs.

## Текущий release scope

Работай только над `PROSMET UX PREMIUM FOUNDATION V1`:

- HTTPS;
- console-error-free UI;
- capability gating;
- adaptive desktop/mobile shell;
- no clipping/overflow;
- ru-RU localization;
- mobile sticky actions;
- save/approve/share separation;
- keyboard-safe row editor;
- WCAG/visual/performance gates;
- exact-SHA live deployment.

Не добавляй новые большие продуктовые модули.

## Рабочий процесс

1. Найди exact main SHA и последний workflow run.
2. Прочитай конкретный failed step/log.
3. Исправь минимальный root cause.
4. Добавь regression guard.
5. Не отключай проверку и не ослабляй security.
6. Продолжай по новым логам до зелёного production gate.

Обязательные проверки:

```bash
npm run source:contract
npm run typecheck
npm run test
npm run build
npm run e2e
```

Нельзя считать результатом commit, PR, local PASS или screenshot без public exact-SHA release.

## Полный набор инструкций

- `/AGENTS.md`
- `/CLAUDE.md`
- `/GEMINI.md`
- `/MIMO.md`
- `/docs/AGENT_BOOTSTRAP_PROMPT.md`
- `/docs/AGENT_ENGINEERING_PLAYBOOK.md`
- `/docs/AGENT_CONTEXT_INDEX.md`
- `/docs/AGENT_TASK_TEMPLATE.md`
- `/docs/PROJECT_SOURCE_OF_TRUTH.md`
- `/docs/WRITE_ACTIONS_RECOVERY.md`
- `/docs/PRODUCT_SPEC_AND_ROADMAP.md`
- `/docs/UX_PREMIUM_FOUNDATION_V1.md`
- `/docs/A2A_DEVELOPER_MODE.md`
