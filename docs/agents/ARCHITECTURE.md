# Архитектура и обязательные границы

## 1. Общая схема

```text
Web / Mobile client
        │
        │ assistant-ui + AG-UI/SSE
        ▼
Next.js application / API
        │
        ├── Domain pipeline
        ├── Deterministic estimate engine
        ├── Documents and export
        ├── Workspace / tenancy services
        ├── Price intelligence
        └── A2A developer control plane
        │
        ├── PostgreSQL — canonical server state
        ├── Object/artifact storage — generated files and evidence
        └── Worker fleet — isolated agent execution

Browser
  └── IndexedDB + outbox — local-first cache and pending operations
```

## 2. Единственный чатовый runtime

Обязательно:

- один корневой `assistant-ui` runtime;
- AG-UI/SSE как единый потоковый транспорт frontend ↔ agent backend;
- tool calls отображают интерактивные артефакты;
- state snapshot/delta сохраняют проектный контекст;
- cancel действительно останавливает активный run.

Запрещено:

- создавать второй самодельный runtime параллельно assistant-ui;
- дублировать историю чата в несогласованных состояниях React;
- выдавать синхронный JSON-ответ вместо AG-UI там, где ожидается поток;
- показывать capability, для которой нет настроенного adapter;
- отправлять секреты в AG-UI события.

## 3. Домен сметы

ИИ отвечает за интерпретацию и объяснение. Итоги рассчитывает только детерминированный движок.

Порядок:

1. нормализация входных данных;
2. технологическая карта;
3. ресурсная ведомость;
4. цены и provenance;
5. детерминированный расчёт;
6. независимая проверка;
7. редактируемый draft;
8. immutable revision;
9. approval / sent / contracted / executed lifecycle.

Денежные вычисления выполняются decimal-арифметикой с определённым округлением. AI не имеет права подменять вычисленный итог текстовым числом.

## 4. Цена как версионируемое наблюдение

Каждая цена должна содержать, насколько применимо:

- наименование и canonical work;
- значение и валюту;
- единицу измерения;
- регион;
- дату и период актуальности;
- вид источника;
- ссылку/идентификатор доказательства;
- НДС и доставку;
- контекст условий;
- confidence;
- статус;
- историю изменения.

Новая цена не стирает старую. Пользовательская правка создаёт новое наблюдение и audit event.

## 5. Документный контур

Все печатные документы строятся из одной доменной версии. Экранный preview, PDF и XLSX не должны расходиться по суммам и составу.

Связь:

```text
ProjectCase
  └── Estimate
       ├── EstimateRevision
       ├── CommercialProposal
       ├── Contract + Appendix
       ├── Invoice
       ├── Act
       ├── KS-2 / KS-3
       └── Material / Equipment statements
```

После утверждения документ ссылается на конкретную revision, а не на изменяемый draft.

## 6. Local-first

### Web

- IndexedDB хранит локальные чаты, сметы, документы, цены, файлы и outbox;
- UI обновляется оптимистически;
- outbox отправляется идемпотентно;
- сервер возвращает cursor/revision;
- конфликт не разрешается молча;
- reload и кратковременный offline не теряют draft.

### Server

- PostgreSQL — canonical состояние организации;
- все запросы tenant-scoped;
- миграции идемпотентны и совместимы с предыдущим release;
- деплой не запускается, если миграция или database probe не прошли.

Запрещено возвращать browser SQLite/WASM (`sql.js`, PGlite, `sql-wasm*.wasm`).

## 7. Adaptive UI

Решение принимается по доступной ширине окна, а не по user-agent.

- Compact: одна рабочая поверхность; смета и row editor — sheets/full screen.
- Medium: navigation rail + одна основная поверхность; supporting context открывается drawer.
- Expanded: sidebar + документ + одна supporting-панель.
- Extra large: sidebar + документ + чат; инспекторы временные.

При нехватке пространства первым скрывается supporting context, а не основной документ.

## 8. A2A control plane

Компоненты:

- Agent Registry;
- Coordinator;
- durable Task Store;
- Scheduler/leases;
- Capability Gateway;
- isolated Worker Fleet;
- Artifact Store;
- independent Verifier;
- Git/CI adapter;
- Deploy adapter;
- AG-UI projection.

A2A-задача всегда owner/tenant/repository scoped. Task содержит цель, контекст, требуемые права, критерии приёмки, артефакты, статусы и audit trail.

## 9. Инфраструктурные источники истины

- `main` — единственная production branch;
- `prosmet-primary` — единственный production runner;
- приложение слушает только внутренний `127.0.0.1:3200` через edge proxy;
- `https://kolibriai.online` — canonical public origin;
- Caddy — HTTPS edge и автоматические сертификаты;
- GitHub Actions — release orchestrator;
- live health обязан возвращать exact release SHA.

## 10. Запрещённые архитектурные сокращения

- секрет или API key в клиентском bundle;
- общий приватный ключ на fleet;
- production shell без ограниченного capability grant;
- неаудируемая мутация БД;
- «успешный» mock вместо реального adapter;
- автоматический deploy непроверенного SHA;
- silent fallback на другую AI-модель;
- прямое изменение утверждённой revision;
- расчёт итогов через floating-point без доменного движка;
- длинная лента служебных карточек вместо одного основного результата.
