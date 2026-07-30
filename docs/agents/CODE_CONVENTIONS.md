# Конвенции кода и репозитория

## 1. Технологический стек

- TypeScript strict;
- React 19;
- Next.js App Router / Node runtime;
- assistant-ui;
- AG-UI;
- Zod для runtime validation;
- Decimal.js для денежных вычислений;
- PostgreSQL;
- IndexedDB local-first;
- Vitest;
- Playwright Chromium;
- Tailwind/CSS в существующей системе;
- Lucide icons только если стиль совпадает с design system.

Не заменять стек и не вводить новый state/UI/database framework без ADR и одобрения владельца.

## 2. Структура ответственности

```text
app/                         routes, layout, API boundaries, global styles
components/app/              application shell and workspace composition
components/chat/             assistant-ui thread/composer/message UI
components/tools/            interactive tool artifacts
lib/domain/                  pure schemas, types, calculations, lifecycle
lib/local/                   IndexedDB, repository, outbox, sync
lib/server/                  server-only services, providers, agents, A2A
lib/exports/                 PDF/XLSX and document runtime
lib/sharing/                 user handoff channels
scripts/                     source contracts and build/release checks
deployment/                  PostgreSQL, immutable deploy, HTTPS edge
e2e/                         user-level desktop/mobile scenarios
docs/agents/                 authoritative agent development instructions
```

UI-компонент не выполняет SQL. Domain-функция не импортирует React/browser API. Server-only code не импортируется в client bundle.

## 3. TypeScript

- не использовать `any`, кроме изолированного boundary с объяснением;
- внешние данные сначала `unknown`, затем Zod/guard;
- discriminated unions для state/lifecycle;
- exhaustive checks для важных статусов;
- не подавлять ошибки `@ts-ignore` без documented reason;
- типы домена экспортируются из domain modules, а не копируются в компонентах;
- optional field не подменяет отсутствующую валидацию.

## 4. React

- компоненты имеют одну понятную ответственность;
- business state находится выше presentation primitives;
- derived values через чистые функции/useMemo только при реальной пользе;
- effect не используется для вычисления того, что можно вычислить во время render;
- effect cleanup обязателен для listener/observer/timer/AbortController;
- не создавать бесконечные mutation observers;
- не хранить один и тот же source of truth в нескольких useState;
- optimistic state должен иметь error/recovery path;
- stable keys — реальные IDs, не index для изменяемых списков.

## 5. Domain calculations

- деньги и проценты — Decimal.js;
- округление определено доменной функцией;
- no implicit floating point totals;
- расчёт не зависит от locale formatting;
- formatter не изменяет значение;
- revision immutable после фиксации;
- validation отделена от UI;
- статус меняется через явный lifecycle.

## 6. API

- Node runtime там, где используются server libraries;
- `force-dynamic` для tenant/runtime-sensitive endpoints;
- request size limit;
- schema validation;
- нормализованные error codes;
- no stack trace в public response;
- no secrets;
- cache-control `no-store` для private/runtime APIs;
- authorization/tenant check до чтения или мутации;
- idempotency для sync/task/deploy mutations;
- cancellation signal передаётся downstream.

## 7. AG-UI

- обязательные события имеют корректные IDs;
- stream завершается `RUN_FINISHED` или явным error/cancel;
- tool args проходят schema;
- state snapshot/delta не содержит secret;
- внутренние рассуждения не выводятся;
- progress — безопасные стадии и статусы;
- tool rendering остаётся доступным после reload;
- cancel прерывает provider и server work.

## 8. IndexedDB и sync

- schema version изменяется осознанно;
- migration не уничтожает существующие данные;
- write формирует outbox operation;
- operation имеет stable ID/revision;
- retry идемпотентен;
- конфликт отображается/разрешается явно;
- local cache failure не маскируется;
- тест проверяет reload и второе device context.

## 9. CSS и дизайн

- использовать design tokens;
- минимизировать fragile `nth-child` selectors;
- предпочитать semantic class/data attribute;
- не исправлять layout JavaScript-пикселями, если достаточно CSS/container behavior;
- target sizes и safe areas обязательны;
- `:focus-visible` не удаляется;
- `prefers-reduced-motion` поддерживается;
- hover не является единственным способом открыть действие;
- print styles не смешиваются с interactive layout без явного scope;
- не скрывать functional defect через `overflow: hidden`.

## 10. Accessibility

- icon-only button имеет `aria-label`;
- dialog имеет role, label, modal semantics;
- focus trap/return;
- status changes имеют подходящий live region;
- input связан с label;
- таблица/список использует семантическую структуру;
- keyboard alternative для drag;
- disabled состояние не заменяет объяснение ошибки;
- touch target policy минимум 44 px для основных controls.

## 11. Tests

### Unit

- pure and deterministic;
- no reliance on wall-clock without injected/frozen time;
- no arbitrary sleeps;
- проверяют инвариант, а не внутреннюю реализацию.

### E2E

- role/label/testid selectors;
- пользовательские действия без `force`, кроме документированного browser limitation;
- ожидание фактического состояния, а не фиксированный timeout;
- console/pageerror capture;
- desktop и mobile;
- screenshot/trace для важных состояний;
- cleanup/test isolation.

## 12. Source contracts

- проверяют архитектурную границу;
- устойчивы к formatter;
- не дублируют grep одного пробела/переноса;
- failure message объясняет invariant;
- новые обязательные инструкции/инфраструктура включаются в contract.

## 13. Git

- атомарные commits;
- conventional, содержательные messages;
- не смешивать product feature и unrelated formatting;
- no force push main;
- один актуальный PR на релизный срез;
- close superseded PRs;
- generated evidence не хранить в repo, если workflow artifact подходит;
- migration и rollback notes в PR.

## 14. Ошибки и observability

- ошибки имеют context/correlation ID;
- user message человекочитаемое;
- technical detail доступно в owner diagnostics;
- не проглатывать exception пустым `catch`;
- ожидаемый abort не логировать как critical error;
- no personal data/secret in logs;
- metrics labels не должны иметь unbounded cardinality.

## 15. Команды перед передачей

```bash
npm ci --no-audit --no-fund
npm run source:contract
npm run typecheck
npm run test
npm run build
npm run e2e
```

Для точечного цикла разрешены релевантные tests, но перед production используется полный workflow на `prosmet-primary`.
