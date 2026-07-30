# Просметчик — карта источников истины

**Назначение:** не позволять агентам работать по памяти, старым отчётам, устаревшим веткам или случайному live-процессу.

## 1. Текущий проект

| Поле | Значение |
|---|---|
| Репозиторий | `leontov/prosmet` |
| Production branch | `main` |
| Production workflow | `.github/workflows/launch-3200.yml` |
| Runner | `prosmet-primary` |
| Public origin | `https://kolibriai.online` |
| Internal listener | `http://127.0.0.1:3200` |
| Server database | PostgreSQL |
| Browser cache | IndexedDB + outbox |
| Chat runtime | assistant-ui |
| Frontend/agent transport | AG-UI over SSE |
| Agent-to-agent protocol | A2A |

## 2. Требования и фактическое состояние — разные источники

### 2.1. Источник требований

Порядок приоритета:

1. Последняя явная инструкция владельца в текущей задаче.
2. `/AGENTS.md`.
3. `docs/PRODUCT_SPEC_AND_ROADMAP.md`.
4. `docs/UX_PREMIUM_FOUNDATION_V1.md`.
5. `docs/A2A_DEVELOPER_MODE.md`.
6. `docs/AGENT_ENGINEERING_PLAYBOOK.md`.
7. Этот документ.
8. `README.md`.

Нижестоящий документ не может ослабить ограничения вышестоящего.

### 2.2. Источник фактического состояния

Факты проверяются в таком порядке:

1. exact SHA ветки `main`;
2. код, миграции и lockfile этого SHA;
3. последний run `Prosmet Main Production`;
4. jobs и полный log первого failed step;
5. release artifact этого run;
6. `https://kolibriai.online/api/health` и `/api/backend/status`;
7. live desktop/mobile smoke;
8. issue `#1` с опубликованным `MAIN PRODUCTION PASS/FAILED`.

Статический документ не доказывает, что production работает. Коммит, screenshot, локальный PASS или процесс на порту не заменяют exact-SHA live evidence.

## 3. Канонические документы

### `/AGENTS.md`

Главный обязательный контракт для любого агента. Содержит архитектурные инварианты, текущий приоритет, release loop, безопасность и правила отчётности.

### `docs/AGENT_ENGINEERING_PLAYBOOK.md`

Операционный алгоритм `observe → reproduce → fix → verify → deploy → live verify → evidence` и поведение при каждом типе failure.

### `docs/PRODUCT_SPEC_AND_ROADMAP.md`

Полное техническое задание: desktop/mobile/React Native, сметы, документы, цены, sync, A2A и дорожная карта.

### `docs/UX_PREMIUM_FOUNDATION_V1.md`

Принятый UX-контракт, дизайн-токены, adaptive breakpoints, accessibility и HTTPS acceptance gate.

### `docs/A2A_DEVELOPER_MODE.md`

Agent Card, реестр ролей, task lifecycle, artifacts, permission ladder и целевая execution architecture.

### `docs/WRITE_ACTIONS_RECOVERY.md`

Runbook восстановления GitHub/connector write-actions, PR/merge и Actions access. Применяется только при фактическом 401/403/404/409/422 или отсутствии write tools.

### `README.md`

Краткая архитектурная карта и общий release gate. Не заменяет документы выше.

## 4. Архитектурный snapshot

### 4.1. Пользовательский контур

```text
assistant-ui
   │
   ├── thread/composer/messages/tool UI
   │
   └── AG-UI SSE
          │
          ▼
     /api/agent
          │
          ├── provider interpretation
          ├── deterministic estimate domain
          ├── document generation
          ├── PostgreSQL
          └── sync/price intelligence
```

### 4.2. Local-first

```text
Web UI
  → IndexedDB draft/cache
  → idempotent outbox
  → PostgreSQL source of truth
  → cursor pull
  → другое устройство
```

Запрещены browser SQLite, SQL.js, PGlite, SQLite-WASM, `unsafe-eval` и WASM eval.

### 4.3. Агентная разработка

```text
owner chat
  → AG-UI developer_workspace
  → A2A task
  → coordinator/agents
  → scoped permission
  → isolated code/test/git/deploy adapters
  → main workflow
  → exact public release evidence
```

A2A task или development plan не означает выполненное изменение. Code, Git и deploy должны иметь реальные adapters и артефакты.

## 5. Доменный source of truth

### Смета

Порядок всегда такой:

`исходные данные → технологическая карта → ресурсы → цены → детерминированный расчёт → review → version → approval → documents`

LLM не вычисляет итог текстом. Формулы исполняются доменным движком и покрываются тестами.

### Цена

Цена является observation, а не одним изменяемым числом. Обязательны:

- источник;
- дата;
- регион;
- единица;
- валюта;
- НДС/доставка/материалы;
- confidence/status;
- context hash;
- связь со сметой и revision.

История не перезаписывается.

### Документы

PDF/XLSX/КП/договор/акт/КС-2/КС-3 создаются из конкретной версии доменной модели. Preview и export не должны расходиться по суммам и реквизитам.

## 6. UX source of truth

- В чате один главный пользовательский artifact.
- Смета — компактная карточка с итогом.
- Desktop — документ и максимум одна supporting surface на средней ширине.
- Mobile — одна основная поверхность, estimate sheet и отдельный row sheet.
- Служебные artifacts сохраняются в state, но не формируют портянку.
- Ненастроенная capability не рендерится.
- Touch target частых действий не меньше 44 px.
- Production console errors равны нулю.
- Даты, числа, валюта, единицы и plural forms используют `ru-RU`.

## 7. Production source of truth

Единственное состояние завершения:

```text
MAIN PRODUCTION PASS
Commit: <exact main SHA>
Runner: prosmet-primary
App: https://kolibriai.online/
Health: exact SHA confirmed
Desktop/mobile live smoke: PASS
```

Если последний run красный, работа начинается с первого failed step, а не с нового общего плана.

## 8. Что является legacy

Следующее допустимо читать только как историю решений:

- репозиторий `rd8r8bkd9m-tech/kolibri-project-main`;
- ветка `app/assistant-ui-local-first-v1`;
- browser SQLite/SQLite-WASM/PGlite;
- старые IP/порты и canary services;
- отчёты, где код или локальный screenshot назывались готовым релизом;
- старые реализации второго chat runtime;
- старые длинные tool-card stacks в чате.

Полезные принципы из legacy уже перенесены в текущие канонические документы: официальный assistant-ui runtime, partial tool arguments, AbortSignal/cancel, native thread primitives, toolkit, local-first, source contracts и реальный browser gate.

## 9. Как устранять противоречие

1. Не выбирать удобный вариант молча.
2. Зафиксировать конфликт: requirement, code, test, live.
3. Определить, что должно быть каноном по иерархии выше.
4. Изменить код и соответствующий документ в одном change set.
5. Добавить regression contract/test.
6. Довести exact SHA до `MAIN PRODUCTION PASS`.

## 10. Правило обновления

При изменении архитектуры агент обязан обновить:

- `/AGENTS.md`, если изменился инвариант;
- этот файл, если изменился source of truth или production topology;
- профильный канонический документ;
- source contract;
- tests;
- release evidence.

Нельзя обновить только документацию и объявить runtime изменённым. Нельзя изменить runtime и оставить канонические инструкции противоречивыми.
