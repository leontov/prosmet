# A2A Developer Mode — архитектура режима разработки Просметчика

## 1. Назначение

Режим разработчика превращает основной чат Просметчика в управляемый центр развития самого продукта. Владелец формулирует цель обычным языком, A2A-координатор создаёт задачу, подбирает специализированных агентов, собирает артефакты, запрашивает необходимые права и доводит изменение до проверяемого релиза.

Этот контур не смешивается с обычной работой сметчика. Клиентские сметы и документы используют тот же chat-first интерфейс, но не получают доступ к коду, Git, инфраструктуре или секретам.

## 2. Границы текущей реализации

### Уже реализовано в версии 0.1

- команда в основном чате открывает `developer_workspace`;
- опубликован Agent Card по адресу `/.well-known/agent-card.json`;
- доступен owner-scoped JSON-RPC endpoint `/api/a2a`;
- методы `message/send`, `tasks/get`, `tasks/list`, `tasks/cancel`;
- реестр специализированных агентов;
- автоматический выбор команды по содержанию запроса;
- development-plan artifact;
- определение требуемого разрешения `propose/test/code/git/deploy`;
- пользовательская рабочая область внутри приложения;
- тесты реестра, task isolation и service command;
- source contract и browser E2E.

### Намеренно ещё не включено

- произвольное выполнение shell-команд;
- запись в рабочее дерево репозитория;
- создание branch/commit/PR;
- merge;
- production deployment;
- передача provider/GitHub/SSH secret в браузер или A2A message;
- долговременная очередь задач между перезапусками процесса.

Версия 0.1 работает в режиме `plan`. Это не имитация успешной разработки: task возвращает план и явно сообщает, что для реальных code/git/deploy операций требуется отдельный owner-approved execution adapter.

## 3. Почему A2A, AG-UI и инструменты разделены

### AG-UI

Используется между пользовательским интерфейсом и текущим агентным запуском:

- поток текста;
- tool calls;
- activity/status;
- shared state;
- cancel;
- продолжение thread.

### A2A

Используется для взаимодействия с самостоятельными агентами и сервисами:

- Agent Card discovery;
- task lifecycle;
- context ID;
- messages;
- artifacts;
- status;
- cancel;
- в будущем streaming/push.

### Инструменты / MCP / adapters

Предоставляют конкретную способность:

- прочитать файл;
- выполнить тест;
- получить Git diff;
- создать commit;
- прочитать workflow;
- задеплоить release;
- проверить live URL.

A2A не заменяет permission system и не даёт агенту права автоматически. Каждый adapter проверяет owner, task, scope и approval.

## 4. Версия протокола

Начальная реализация фиксирует `protocolVersion: 0.3.0` как стабильный совместимый контракт текущего A2A JavaScript-стека. Код изолирует protocol card, registry и task store, чтобы миграция на A2A 1.x не меняла бизнес-сущности Просметчика.

Переход на 1.x выполняется отдельной фазой после появления стабильной совместимости используемого SDK и включает:

- schema compatibility tests;
- dual-version adapter на переходный период;
- migration Agent Card;
- contract tests внешнего клиента;
- удаление legacy endpoint только после подтверждённой совместимости.

## 5. Agent Card

Agent Card должен содержать только публичную информацию:

- название и описание;
- URL A2A endpoint;
- protocol/version;
- capabilities;
- input/output modes;
- skills;
- примеры задач.

Agent Card не содержит:

- API keys;
- внутренние IP;
- SSH данные;
- GitHub token;
- provider secrets;
- список приватных репозиториев;
- owner cookie;
- детали незавершённых задач.

## 6. Реестр агентов

### Kolibri Coordinator

Декомпозиция цели, выбор команды, зависимости, критерии приёмки, итоговая проверка.

### Product Architect

Продуктовый контракт, сценарии, доменная модель, непротиворечивость с дорожной картой.

### Frontend Engineer

Next.js, React, assistant-ui, AG-UI, desktop/mobile web, доступность, sheets и редакторы.

### Backend Engineer

API, PostgreSQL, tenant isolation, sync, providers, documents и integrations.

### React Native Engineer

iOS/Android, Expo, offline store, camera/share, native UX и общие схемы.

### Estimate & Documents Expert

Технология, ресурсы, цены, сметы, версии, КП, договоры, акты, КС-2/КС-3/М-29.

### QA Engineer

Source contracts, unit, build, Chromium desktop/mobile, native simulator/emulator, live smoke.

### Release Engineer

CI/CD, immutable releases, runner, deployment, rollback, evidence.

### Security Engineer

Threat model, authorization, tenant isolation, secrets, audit и approval boundaries.

Агент не получает новые права из своей роли. Роль определяет область ответственности; разрешение задаёт конкретная задача.

## 7. Task lifecycle

Целевые состояния:

- `submitted` — задача принята;
- `working` — идёт выполнение;
- `input-required` — нужен ответ/approval владельца;
- `completed` — требуемый артефакт сформирован и проверен;
- `failed` — выполнение завершилось ошибкой;
- `canceled` — владелец остановил задачу.

В версии 0.1 план формируется синхронно, поэтому `message/send` возвращает `completed` development-plan task. Реальный execution task в следующих версиях будет долговременным и durable.

Каждая задача имеет:

- `id`;
- `contextId`;
- owner/workspace ownership на сервере;
- status + timestamp;
- user/agent messages;
- artifacts;
- selected agent IDs;
- requested permission;
- owner approval requirement;
- created/updated timestamps.

## 8. Artifacts

Плановый контур создаёт `development-plan`:

- summary;
- selected agents;
- stages;
- acceptance criteria;
- requested permission;
- execution mode.

Будущие execution artifacts:

- `repository-snapshot`;
- `diagnostic-report`;
- `design-decision`;
- `patch`;
- `test-report`;
- `browser-screenshot`;
- `security-review`;
- `commit`;
- `pull-request`;
- `deployment-evidence`;
- `rollback-evidence`.

Артефакт не считается доказательством сам по себе. Например, `commit` не заменяет `deployment-evidence`, а screenshot не заменяет проверяемый E2E.

## 9. Permission ladder

### Уровень 0 — discover

Публичный Agent Card и список общих skills.

### Уровень 1 — read

Чтение разрешённого repository/runtime контекста. Запрещены секреты и персональные данные вне scope.

### Уровень 2 — propose

Планы, ADR, patches как текстовые артефакты без записи в репозиторий.

### Уровень 3 — code

Изменение файлов в изолированном workspace задачи. Требуется owner approval или заранее выданная ограниченная policy.

### Уровень 4 — test

Запуск allowlisted команд в sandbox/runner, сбор логов и артефактов. Не даёт права Git или deploy.

### Уровень 5 — git

Создание branch/commit/PR. Merge отдельно подтверждается политикой.

### Уровень 6 — deploy

Запуск release workflow для точного SHA после обязательного gate. Не означает право обходить тесты или менять production вручную.

Любой approval содержит:

- owner ID;
- task ID;
- scope;
- repository/environment;
- разрешённые команды/операции;
- срок действия;
- максимум затрат/времени;
- nonce;
- audit record.

## 10. Execution architecture — следующие версии

### 10.1. Durable task store

PostgreSQL таблицы:

- `agent_tasks`;
- `agent_task_messages`;
- `agent_artifacts`;
- `agent_approvals`;
- `agent_leases`;
- `agent_events`;
- `release_evidence`.

### 10.2. Coordinator

- принимает A2A task;
- строит DAG;
- выбирает агента/provider;
- выдаёт lease;
- следит за timeout/retry;
- собирает артефакты;
- останавливается на approval gate;
- передаёт результат verifier.

### 10.3. Workspace executor

- создаёт изолированную копию точного base SHA;
- не использует рабочее дерево владельца;
- ограничивает filesystem/network/process;
- применяет patch;
- выдаёт diff artifact;
- удаляет или архивирует workspace по retention policy.

### 10.4. Test executor

Allowlist первоначально:

- source contract;
- typecheck;
- unit tests;
- production build;
- scoped Playwright;
- lint/security checks;
- approved migration dry-run.

Команда, отсутствующая в allowlist, требует отдельного approval.

### 10.5. Git adapter

- создаёт branch из точного base SHA;
- применяет проверенный patch;
- commit подписывает task metadata;
- создаёт PR;
- проверяет required checks;
- merge выполняет только при разрешённой policy.

### 10.6. Release adapter

- запускает существующий main workflow;
- не подменяет deployment shell обходным путём;
- ждёт завершения;
- читает jobs/logs;
- при failed gate создаёт failure artifact и возвращает задачу в работу;
- при success проверяет health/backend/live E2E;
- сохраняет release SHA и URL.

## 11. Безопасность

### Обязательные запреты

- секрет в prompt, task artifact или browser state;
- общий приватный SSH key в fleet;
- произвольный shell от модели без adapter policy;
- self-approval агентом;
- merge/deploy без точного SHA;
- использование данных другого tenant;
- маскировка failed test как warning;
- silent fallback на другой provider для code/deploy задачи;
- публикация внутреннего chain-of-thought.

### Обязательные проверки

- owner/workspace isolation;
- CSRF/origin policy для write endpoints;
- signed approval;
- rate/quota/budget;
- timeout/cancel;
- artifact integrity hash;
- audit log;
- secret scanning;
- dependency and code security scan;
- rollback readiness.

Текущий cookie-based owner scope достаточен только для plan-only прототипа. До включения code/git/deploy требуется полноценная аутентификация и workspace membership.

## 12. UI контракты

В чате отображается компактная карточка:

- A2A protocol;
- количество агентов;
- состояние подключения;
- кнопка открытия.

В developer sheet:

- постановка задачи;
- выбранная команда;
- requested permission;
- этапы и критерии приёмки;
- состояние task;
- список агентов;
- permission contour;
- в следующих версиях: diff, logs, screenshots, approval, commit, PR, deploy.

Служебный поток не должен превращать основной чат в лог терминала. Подробные логи находятся в task workspace и открываются по запросу.

## 13. API версии 0.1

### Discovery

`GET /.well-known/agent-card.json`

### Registry / recent tasks

`GET /api/a2a`

### Create plan task

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "messageId": "client-message-id",
      "parts": [
        {
          "kind": "text",
          "text": "Исправь редактор сметы и подготовь релиз"
        }
      ]
    }
  }
}
```

### Read task

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tasks/get",
  "params": { "id": "task-id" }
}
```

### Cancel task

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tasks/cancel",
  "params": { "id": "task-id" }
}
```

### List tasks — Prosmet extension

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tasks/list",
  "params": {}
}
```

## 14. Acceptance gates по версиям

### 0.1 Plan mode

- Agent Card;
- JSON-RPC methods;
- owner isolation;
- registry;
- UI;
- unit/source/browser tests.

### 0.2 Read mode

- authenticated owner;
- repository/runtime read adapter;
- allowlist;
- redaction;
- diagnostic artifact;
- audit.

### 0.3 Code + test sandbox

- exact SHA workspace;
- patch artifact;
- filesystem/process isolation;
- approved commands;
- test report;
- cancel/timeout;
- cleanup.

### 0.4 Git mode

- branch/commit/PR;
- required checks;
- signed task metadata;
- merge approval;
- no direct main write from agent.

### 0.5 Release mode

- main workflow dispatch;
- job/log monitoring;
- automatic repair loop with bounded retries;
- exact live SHA;
- health/backend/E2E;
- rollback;
- release evidence.

Только после 0.5 владелец получает полноценный сценарий «поставил задачу в чате — получил проверенный живой продукт» без обязательного использования внешней IDE.
