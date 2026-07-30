# Agent Context Index — Просметчик

Этот индекс предотвращает работу агентов по устаревшим веткам, чужим репозиториям и старым архитектурным отчётам.

## 1. Канонические источники

| Приоритет | Файл | Назначение |
|---:|---|---|
| 1 | `/AGENTS.md` | обязательные правила всех агентов |
| 2 | `/docs/PRODUCT_SPEC_AND_ROADMAP.md` | полное ТЗ, продуктовая модель и roadmap |
| 3 | `/docs/UX_PREMIUM_FOUNDATION_V1.md` | текущий release scope, design tokens, adaptive/HTTPS contract |
| 4 | `/docs/A2A_DEVELOPER_MODE.md` | роли, task lifecycle, permission ladder и execution architecture |
| 5 | `/docs/AGENT_ENGINEERING_PLAYBOOK.md` | операционный цикл observe→fix→release |
| 6 | `/README.md` | краткая архитектура и release gate |
| 7 | `/package.json` | фактические команды и source contracts |
| 8 | `/.github/workflows/launch-3200.yml` | production gate и deployment truth |
| 9 | `/scripts/*contract*.mjs` | machine-enforced invariants |
| 10 | `/e2e`, unit tests, migrations | исполняемый acceptance contract |

## 2. Текущий фактический контур

```text
Repository: leontov/prosmet
Branch: main
Runner: prosmet-primary
Internal app: 127.0.0.1:3200
Public origin: https://kolibriai.online
Public IPv4: 78.17.4.108
Server authority: PostgreSQL
Browser cache/outbox: IndexedDB
Streaming: AG-UI SSE
Chat runtime: assistant-ui
HTTPS edge: Caddy automatic TLS
```

Любое утверждение о текущем состоянии проверяется по exact main SHA, workflow jobs/logs и live health, а не по дате документа.

## 3. Текущий release scope

`PROSMET UX PREMIUM FOUNDATION V1`:

- HTTPS;
- ноль console errors;
- capability gating;
- frozen references/design tokens;
- adaptive shell;
- no clipping;
- ru-RU localization;
- mobile sticky actions;
- разделение save/approve/share;
- keyboard-safe row editor;
- WCAG/visual/performance gates;
- desktop/mobile E2E;
- exact-SHA live evidence.

До его закрытия новые большие продуктовые модули не добавляются.

## 4. Исторические материалы

Владелец предоставил исторический отчёт о другом контуре:

```text
Repository: rd8r8bkd9m-tech/kolibri-project-main
Branch: app/assistant-ui-local-first-v1
SQLite-based local data
Commit: d573f12e...
```

Этот материал полезен только как источник общих уроков:

- использовать официальный assistant-ui runtime и thread primitives;
- toolkit API вместо устаревших tool hooks;
- корректно обрабатывать partial streaming tool arguments;
- поддерживать cancel/AbortSignal и SSE framing;
- не создавать фиктивный пустой thread;
- хранить сообщения/tool artifacts устойчиво;
- проверять desktop/mobile Chromium.

Он **не является source of truth** для:

- текущего repository/branch/SHA;
- текущей базы данных;
- production status;
- runner topology;
- deployment URL;
- текущего release scope.

В `leontov/prosmet` PostgreSQL остаётся server authority, IndexedDB — browser cache/outbox, а browser SQLite/WASM запрещён.

## 5. Как определить актуальный статус

1. прочитать последний commit `main`;
2. найти workflow run для него;
3. открыть job steps;
4. при failure прочитать лог failed step;
5. проверить `https://kolibriai.online/api/health`;
6. сравнить `releaseSha` с main SHA;
7. проверить public headers и live E2E artifact.

Нельзя использовать старый `MAIN PRODUCTION PASS`, если `main` уже продвинулся на новый SHA.

## 6. Как обновлять документацию

При существенном изменении:

- product scope → `PRODUCT_SPEC_AND_ROADMAP.md`;
- UX/tokens/adaptive/HTTPS → `UX_PREMIUM_FOUNDATION_V1.md` или новая версия;
- A2A roles/tasks/permissions → `A2A_DEVELOPER_MODE.md`;
- agent operating rules → `AGENTS.md` и playbook;
- command/gate → `package.json`, workflow и source contract;
- architectural decision → отдельный ADR с owner approval.

Документ без machine-enforced contract не должен быть единственной защитой критического инварианта.

## 7. Запрещённые источники статуса

Не использовать как доказательство готовности:

- текст предыдущего ответа агента;
- название ветки;
- наличие PR;
- локальный screenshot;
- старый artifact;
- raw IP, если нужен public HTTPS;
- commit без workflow run;
- workflow run другого SHA;
- mock-only проверку production интеграции.

## 8. Обязательный вопрос перед изменением

```text
Какой exact blocker мешает текущему main SHA пройти следующий обязательный gate?
```

Если ответ не подтверждён логом, probe или тестом, сначала проводится наблюдение, а не кодирование.