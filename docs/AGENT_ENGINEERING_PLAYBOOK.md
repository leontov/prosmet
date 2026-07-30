# Agent Engineering Playbook — Просметчик

**Статус:** обязательный операционный playbook для агентной разработки `leontov/prosmet`.

**Главная цель:** агент не производит отчёты вместо результата. Он доводит один наблюдаемый пользовательский или release blocker до живого проверенного результата.

## 1. Карта проекта

```text
Пользователь / владелец
        │
        ▼
assistant-ui chat runtime
        │ AG-UI / SSE
        ▼
Prosmet agent backend
        │
        ├── deterministic estimate engine
        ├── document generation
        ├── provider routing
        ├── IndexedDB sync/outbox
        ├── PostgreSQL source of truth
        └── A2A developer control plane

Production:
GitHub main
  → Prosmet Main Production
  → runner prosmet-primary
  → immutable release :3200
  → Caddy HTTPS edge
  → https://kolibriai.online
```

## 2. Что агент обязан прочитать

До работы:

1. `/AGENTS.md`;
2. `docs/PRODUCT_SPEC_AND_ROADMAP.md`;
3. `docs/UX_PREMIUM_FOUNDATION_V1.md` для UI/HTTPS задач;
4. `docs/A2A_DEVELOPER_MODE.md` для agent/control-plane задач;
5. `README.md`;
6. релевантный source contract;
7. production workflow и последний failed job log.

## 3. Стандарт задачи

Любая задача формулируется как наблюдаемый результат:

```yaml
goal: Что должен увидеть или получить пользователь
current_evidence: Точный SHA, run ID, failing step, live URL/status
scope: Файлы и контуры, которые разрешено менять
forbidden: Что нельзя добавлять, удалять или ослаблять
acceptance: Машинные и визуальные критерии
release_gate: Какой workflow и какой public live check обязаны пройти
```

Плохая задача:

```text
Улучшить всё приложение.
```

Хорошая задача:

```text
На mobile 390×844 строка раздела не должна обрезаться, row sheet не должен
скрываться под клавиатурой, а exact main SHA должен пройти live HTTPS E2E.
```

## 4. Рабочая волна

### Phase A — Observe

1. Получить exact `main` SHA.
2. Найти последний `Prosmet Main Production` run.
3. Если run красный — открыть jobs, затем failed job log.
4. Назвать первый реальный failure, остальные skipped steps не считать проверенными.
5. Проверить, относится ли failure к коду, CI, runner, DNS, TLS, provider или внешней политике.

Результат Phase A — одна строка:

```text
Blocker: <step> падает потому, что <машинное доказательство>.
```

### Phase B — Reproduce

- воспроизвести минимальным scoped test, source contract или shell probe;
- не запускать весь проект, если failure можно доказать коротким probe;
- сохранить точный error text;
- проверить assumptions по текущему коду и окружению, не по памяти.

### Phase C — Fix

- исправить минимальный корень ошибки;
- не отключать проверку;
- не добавлять hidden fallback;
- не расширять scope без необходимости;
- сохранить обратимость;
- добавить regression coverage.

### Phase D — Verify before release

Минимум:

```bash
npm run source:contract
npm run typecheck
npm run test
npm run build
```

Для UI:

```bash
npm run e2e
```

Для scoped browser issue допустим сначала один Playwright spec, но до релиза полный обязательный набор запускает production workflow.

### Phase E — Release

- production source только `main`;
- exact SHA проходит `.github/workflows/launch-3200.yml`;
- deploy feature branch запрещён;
- ручной process на `3200` не заменяет workflow;
- release artifact всегда привязан к exact SHA.

### Phase F — Live verify

Обязательно проверить:

- `https://kolibriai.online/api/health` содержит exact SHA;
- backend connected, driver PostgreSQL;
- browser cache IndexedDB, WASM false;
- HTTP redirect;
- HSTS;
- CSP без `unsafe-eval` и WASM eval;
- desktop live smoke;
- mobile live smoke;
- production console errors отсутствуют;
- контрольные screenshots сохранены.

### Phase G — Report

Отчёт короткий и доказательный:

```text
MAIN PRODUCTION PASS
Commit: ...
Run: ...
Fixed: ...
Verified: source/type/unit/build/e2e/HTTPS/exact SHA
App: https://kolibriai.online/
Evidence: artifact ...
```

Не перечислять внутреннюю активность как замену пользовательскому результату.

## 5. Failure loop

Если gate падает:

1. не писать финальный отчёт;
2. открыть новый failure log;
3. определить, это новый blocker или regression;
4. исправить;
5. запустить новый exact-SHA gate;
6. повторять до PASS.

Порядок важен: не исправляй предполагаемую следующую ошибку до чтения фактического лога.

## 6. Категории blocker и обязательное поведение

### 6.1. Source contract

- исправить нарушение архитектуры или сам контракт, если он неверно проверяет допустимый эквивалент;
- изменение контракта должно сохранять смысл защиты;
- нельзя удалить contract из `package.json` ради PASS.

### 6.2. TypeScript

- строгая типизация обязательна;
- не использовать `any` как общий обход;
- normalizer/validator на внешней границе предпочтительнее cast внутри домена.

### 6.3. Unit tests

- сначала определить: regression, stale expectation или nondeterminism;
- stale test менять только вместе с новым утверждённым contract;
- flaky test стабилизировать, а не увеличивать timeout без анализа.

### 6.4. Build

- production build не зависит от dev-only behavior;
- server secrets не попадают в client bundle;
- optional capability должна fail closed.

### 6.5. Playwright

- исправлять реальную геометрию, focus, stacking и interaction;
- `force: true` не использовать как замену исправлению UI;
- click target должен быть реально видимым и доступным;
- screenshots — evidence, но не замена assertions.

### 6.6. Database

- PostgreSQL — authority;
- миграции idempotent и non-destructive по умолчанию;
- destructive change требует отдельного owner approval, backup и rollback;
- tenant leakage — P0 blocker.

### 6.7. HTTPS/DNS

- apex A должен указывать на `78.17.4.108`;
- certificate выдаётся для `kolibriai.online`;
- не отключать certificate validation;
- DNS, 80/443, TLS, redirect и HSTS проверяются отдельно;
- raw IP/3200 — диагностика, не пользовательский URL.

### 6.8. Runner/infrastructure

- сначала определять реальную capability runner;
- не предполагать passwordless sudo, Docker или systemd;
- использовать fail-closed runtime strategy с явным status artifact;
- не убивать процесс на порту без проверки ownership;
- Mac пользователя не использовать для тяжёлой сборки; тяжёлая работа выполняется на Primary/кластере.

### 6.9. External blocker

Внешним blocker можно признать только факт, который нельзя исправить кодом или доступным adapter:

- DNS zone не направлена на Primary;
- firewall/provider блокирует порт;
- отсутствует owner approval на чувствительное действие;
- OAuth installation не даёт нужный repository scope.

Требуется evidence:

```text
expected
actual
probe command/result
action required from owner/provider
what will resume automatically after resolution
```

## 7. UX Premium checklist

### Desktop

- document не зажат тремя постоянными панелями на среднем viewport;
- no horizontal page scroll;
- длинное название и section title переносятся корректно;
- quantity/unit/price/amount читаемы;
- keyboard flow работает;
- focus не скрывается;
- supporting chat сворачивается по adaptive contract;
- print preview соответствует export model.

### Mobile

- одна основная поверхность;
- estimate sheet и row sheet используют safe areas;
- touch targets ≥44px;
- header не обрезает title;
- total не вытесняет первые позиции;
- row sheet keyboard-safe;
- sticky footer остаётся видимым;
- numeric inputs используют подходящий input mode;
- system back закрывает вложенную поверхность без потери данных;
- share работает одним понятным действием.

### Capability policy

Не показывать интерактивную кнопку, если adapter отсутствует. Особенно:

- speech playback;
- feedback;
- dictation;
- native share;
- provider-specific actions.

## 8. Estimate domain checklist

Перед созданием estimate:

- [ ] объект и регион определены или явно отмечены как assumption;
- [ ] технологическая последовательность сформирована;
- [ ] ресурсы выведены из технологии;
- [ ] материалы/механизмы/логистика/отходы учтены;
- [ ] источники цены имеют provenance;
- [ ] единицы нормализованы;
- [ ] расчёт выполняется Decimal/deterministic engine;
- [ ] blockers/warnings отделены;
- [ ] user-facing chat получает одну compact card;
- [ ] service artifacts сохраняются в background state;
- [ ] revision immutable при сохранении версии;
- [ ] documents используют approved revision.

## 9. A2A execution model

### Coordinator

- превращает цель в DAG;
- назначает специализированные роли;
- не выполняет все задачи сам;
- формирует acceptance до выполнения;
- останавливается на approval boundary;
- возвращает failed release обратно в работу.

### Product Architect

- защищает scope и целостность product spec;
- запрещает новые модули во время UX Foundation;
- фиксирует ADR только при реальном архитектурном изменении.

### Frontend Engineer

- assistant-ui/AG-UI invariants;
- adaptive desktop/mobile;
- accessibility;
- no inert controls;
- browser evidence.

### Backend Engineer

- API, PostgreSQL, sync, tenancy, provider adapters;
- no browser secrets;
- idempotency/retry/cancel.

### Estimate & Documents Expert

- технология до сметы;
- deterministic calculation;
- provenance цен;
- согласованность документов.

### QA Engineer

- independent verification;
- source/type/unit/build/E2E;
- console/network/accessibility/visual evidence;
- не принимает self-reported PASS.

### Security Engineer

- authorization, tenancy, secrets, CSP, permissions, threat boundaries;
- не ослабляет protection ради релиза.

### Release Engineer

- exact SHA;
- основной workflow;
- immutable release;
- HTTPS/live evidence;
- rollback readiness.

## 10. Permission ladder

```text
discover  публичный Agent Card
read      чтение scoped context
propose   plan/ADR/patch artifact без записи
code      изменение isolated workspace
 test     allowlisted execution
 git      branch/commit/PR
 deploy   основной exact-SHA release workflow
```

`deploy` не даёт права пропускать gate. `git` не даёт права merge. Агент не выдаёт approval самому себе.

## 11. Что запрещено считать результатом

- «написан код»;
- «создан PR»;
- «локально работает»;
- «build прошёл», если E2E/deploy skipped;
- screenshot без assertions;
- HTTP IP вместо HTTPS domain;
- old SHA на live;
- тест с mock вместо required production integration;
- report с перечислением оставшихся ошибок.

## 12. Definition of Done

Задача завершена, только когда:

1. пользовательский результат наблюдаем;
2. regression coverage добавлен;
3. full production gate зелёный;
4. live domain обслуживает exact main SHA;
5. desktop/mobile live smoke зелёные;
6. evidence artifact создан;
7. открытых P0/P1 по этой задаче нет;
8. итоговый статус — `MAIN PRODUCTION PASS`.