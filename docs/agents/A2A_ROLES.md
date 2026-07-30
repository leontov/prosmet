# A2A-роли, задачи и артефакты

## Цель

A2A — внутренний протокол реальной командной работы, а не визуальный список агентов. Пользователь общается с единым Просметчиком, а координатор создаёт проверяемые задачи специализированной команде.

## Базовые роли

### 1. Kolibri Coordinator

Отвечает за:

- понимание общей цели;
- декомпозицию в DAG;
- выбор исполнителей;
- ограничения scope;
- зависимости;
- progress aggregation;
- запрос owner approval;
- reducer результата.

Не должен самостоятельно переписывать всё приложение, если подзадачи можно делегировать.

### 2. Product Architect

- пользовательские роли и critical path;
- информационная архитектура;
- доменные boundaries;
- acceptance criteria;
- предотвращение scope creep;
- совместимость roadmap.

### 3. Frontend / UX Engineer

- assistant-ui и AG-UI presentation;
- adaptive shell;
- estimate/document editors;
- keyboard/mobile UX;
- accessibility;
- design tokens;
- visual regression;
- performance интерфейса.

### 4. Backend / Data Engineer

- API и service boundaries;
- PostgreSQL;
- migrations;
- tenancy;
- sync/outbox;
- idempotency;
- document and price services;
- observability.

### 5. React Native Engineer

- native navigation;
- offline storage;
- files/camera/share;
- mobile keyboard/safe areas;
- reuse domain/contracts without WebView-копии;
- iOS/Android release readiness.

### 6. Estimate & Documents Domain Engineer

- технологические карты;
- нормы, коэффициенты и Decimal calculations;
- price provenance;
- revisions/approval;
- PDF/XLSX;
- КП, договоры, счета, акты и КС;
- consistency between UI and print.

### 7. QA / Accessibility Engineer

- test strategy;
- deterministic E2E;
- desktop/mobile/viewport matrix;
- accessibility;
- visual diff;
- performance evidence;
- defect reproduction.

### 8. Release / SRE Engineer

- exact-SHA pipeline;
- Primary runner;
- PostgreSQL readiness;
- Caddy/HTTPS;
- immutable releases;
- smoke/evidence;
- rollback;
- incident response.

### 9. Security Engineer

- threat model;
- permissions;
- secret isolation;
- tenant boundaries;
- supply-chain review;
- A2A capability gateway;
- production approvals;
- audit trail.

## Task lifecycle

Рекомендуемые состояния:

```text
submitted
planning
blocked
ready
running
awaiting-verification
changes-requested
awaiting-owner-approval
approved
releasing
completed
failed
cancelled
rolled-back
```

`completed` разрешён только после выполнения acceptance criteria. Для release-задачи — только после production PASS.

## Task contract

Каждая задача содержит:

```json
{
  "id": "task-id",
  "contextId": "project/thread-id",
  "ownerId": "tenant-owner",
  "repository": "leontov/prosmet",
  "baseSha": "exact-sha",
  "goal": "observable outcome",
  "scope": ["allowed paths/services"],
  "prohibited": ["out-of-scope actions"],
  "dependencies": ["task-id"],
  "agentIds": ["agent-id"],
  "requiredPermissions": ["read", "write"],
  "acceptanceCriteria": ["criterion"],
  "status": {"state": "running"},
  "artifacts": [],
  "audit": []
}
```

## Permission ladder

```text
read
analyze
plan
execute-tests
write-sandbox
write-branch
open-pr
merge-main
migrate-staging
deploy-preview
deploy-canary
migrate-production
deploy-production
rollback-production
read-secret-reference
```

Принципы:

- default deny;
- минимальный scope;
- краткий TTL;
- repository/environment binding;
- owner approval для повышенных прав;
- повторная авторизация для production/secrets;
- полный audit;
- revoke/kill switch.

## Artifact types

### План

- DAG;
- исполнители;
- критерии приёмки;
- риски;
- разрешения.

### Исследование

- source references;
- assumptions;
- decision record;
- alternatives.

### Code change

- patch/diff;
- changed files;
- migrations;
- tests;
- compatibility notes.

### UX evidence

- reference screenshot;
- rendered screenshot;
- viewport;
- visual diff;
- accessibility report;
- interaction trace.

### QA evidence

- unit/integration/E2E logs;
- Playwright trace/video;
- reproduction steps;
- defect severity.

### Release evidence

- commit SHA;
- workflow run;
- image/release directory;
- health/backend response;
- TLS/headers;
- live screenshots;
- rollback target.

## Передача задачи

Исполнитель передаёт verifier не просто текст, а:

```text
Goal
Base SHA
Result SHA
Changed files
User scenario
Tests run
Evidence URIs
Known risks
Required next permission
```

Verifier возвращает:

```text
PASS
или
CHANGES_REQUESTED + reproducible defects
```

## Reducer

Координатор обязан:

- убрать дубликаты;
- разрешить конфликтующие решения;
- выбрать один source of truth;
- связать артефакты с acceptance criteria;
- не скрывать failed checks;
- сформировать понятное владельцу резюме;
- не раскрывать приватные chain-of-thought рассуждения.

## Масштабирование

Тысяча логических агентов не означает тысячу одновременно выполняющихся процессов.

Scheduler должен контролировать:

- concurrency;
- rate limits;
- memory/CPU budgets;
- queue priorities;
- leases/heartbeats;
- retries/backoff;
- cancellation;
- backpressure;
- duplicate suppression;
- provider cost budgets.

UI показывает этапы, блокировки и артефакты, а не поток из тысяч однотипных сообщений.

## Fail-closed правило

Если нет реального Git, test, deploy или secret adapter, агент обязан вернуть `requires-action`/`blocked`, а не симулировать успех.

Plan-only режим должен быть явно помечен. Переход к выполнению происходит только после выдачи capability и появления audit event.

## Взаимодействие с обычным чатом

- основной пользователь продолжает работать с единым Просметчиком;
- agent work trace свёрнут и безопасен;
- важные вопросы задаются только когда они блокируют результат;
- пользователь получает карточку результата, а не внутреннюю переписку агентов;
- owner-only developer workspace отделён permission boundary.
