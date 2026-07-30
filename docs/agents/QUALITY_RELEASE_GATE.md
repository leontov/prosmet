# Качество и production release gate

## Неподвижное правило

Задача не завершена, пока текущий exact `main` SHA не прошёл `Prosmet Main Production`, не развёрнут и не проверен на `https://kolibriai.online`.

## Последовательность gate

1. Проверить runner, branch и exact SHA.
2. Clean checkout exact SHA.
3. Установить locked dependencies.
4. Поднять/проверить persistent PostgreSQL.
5. Проверить `DATABASE_URL`.
6. Выполнить идемпотентные миграции.
7. Выполнить source contracts.
8. Typecheck.
9. Unit tests.
10. Production build.
11. Desktop/mobile Chromium до deploy.
12. Проверить отсутствие browser SQL/WASM.
13. Создать immutable release.
14. Проверить внутренний exact SHA и backend.
15. Поднять/проверить HTTPS edge.
16. Проверить публичный exact SHA, redirect и HSTS.
17. Desktop/mobile smoke на живом HTTPS.
18. Собрать evidence artifact.
19. Опубликовать `MAIN PRODUCTION PASS`.

Пропущенный шаг равен провалу gate.

## Source contracts

Contracts обязаны защищать архитектурные инварианты, а не форматирование одной строки.

Хороший contract:

- проверяет наличие обязательного файла/API;
- проверяет запрещённые зависимости;
- проверяет один runtime/transport;
- проверяет release integration;
- допускает безопасный рефакторинг и форматирование.

Плохой contract:

- ищет слишком хрупкий exact substring;
- дублирует TypeScript typecheck;
- проходит при неработающей функции;
- блокирует корректное форматирование;
- отключается ради зелёного gate.

При ложном падении исправляется contract так, чтобы сохранить инвариант, а не удалить проверку.

## Unit tests

Покрыть:

- расчёты Decimal и округление;
- lifecycle статусов;
- validation blockers;
- парсинг исходных данных;
- price provenance/history;
- tenant/owner isolation;
- A2A task routing, permissions, cancel, idempotency;
- provider routing без silent fallback;
- sync merge/outbox.

Unit test не заменяет E2E пользовательского сценария.

## Integration tests

Проверить:

- PostgreSQL migrations;
- API schema и authorization;
- IndexedDB outbox → PostgreSQL → другое устройство;
- документы и revisions;
- provider adapters;
- A2A durable task lifecycle;
- release metadata;
- secure cookies behind proxy.

## Desktop/mobile E2E

Минимальный critical suite:

1. Чистый запуск без console/page errors.
2. Сообщение создаёт компактную карточку сметы.
3. Служебные artifacts не раздувают ленту.
4. Карточка открывает правильную adaptive workspace.
5. Реквизиты извлекаются из обычного сообщения.
6. Цена/количество меняются и итог пересчитывается.
7. Mobile row sheet keyboard-safe.
8. Автосохранение завершается.
9. Reload восстанавливает draft/карточку.
10. Offline edit остаётся в outbox.
11. Sync виден на другом device context.
12. PDF/XLSX формируются.
13. Передача клиенту фиксирует sent revision и confirmed prices.
14. Cancel останавливает streaming run.
15. Developer workspace не перекрывается chat layer.

Selectors должны опираться на role/label/testid, а не на случайную DOM-геометрию.

## Console gate

На production-сценариях запрещены:

- uncaught errors/rejections;
- hydration mismatch;
- maximum update depth;
- adapter not configured;
- CSP violations;
- WASM/SQLite errors;
- insecure blob warnings;
- page crash/OOM;
- failed essential network requests.

Предупреждение допускается только после явной классификации и allowlist с причиной. Общий regex, скрывающий любые ошибки, запрещён.

## Accessibility gate

Автоматически:

- axe или эквивалент для ключевых экранов;
- semantic labels;
- contrast;
- duplicate IDs;
- focusable hidden content.

В E2E:

- keyboard traversal;
- focus trap/return;
- sticky header/footer не перекрывает focus;
- touch target policy;
- reduced motion.

Периодически вручную:

- VoiceOver;
- TalkBack;
- browser zoom 200%/400%.

## Visual regression gate

Контрольные размеры минимум:

- 360×800;
- 390×844;
- 430×932;
- 768×1024;
- 1366×768;
- 1440×900/960;
- 1920×1080.

Контрольные состояния:

- empty chat;
- compact estimate card;
- desktop workspace;
- mobile estimate sheet;
- mobile row editor + keyboard-safe footer;
- saved preview;
- share dialog;
- offline/error state;
- developer workspace.

Baseline обновляется только вместе с сознательным design decision. Нельзя принимать новый baseline, чтобы скрыть regression.

## Performance gate

Проверить:

- Web Vitals;
- long tasks при редактировании большой сметы;
- время открытия sheet;
- latency local autosave;
- bundle regression;
- memory growth после многократного открытия/закрытия workspace.

Значительное ухудшение блокирует релиз даже при функционально зелёных тестах.

## Security gate

- secrets scan;
- dependency audit по принятой политике;
- auth/tenant isolation tests;
- secure cookies;
- CSP и HSTS;
- permission checks для A2A/write/deploy;
- отсутствие секретов в logs/artifacts/client bundle;
- migration safety;
- rate/request size limits.

## HTTPS gate

Обязательно:

- `kolibriai.online` резолвится на production IP;
- HTTP перенаправляет на HTTPS;
- сертификат валиден для hostname;
- HSTS присутствует;
- proxy передаёт `X-Forwarded-Proto: https`;
- `/api/health` возвращает exact SHA;
- live UI открывается без mixed content;
- blob/export/share работают в secure origin.

## Evidence artifact

Artifact содержит:

```text
artifacts/logs/npm-ci.log
artifacts/logs/source-contract.log
artifacts/logs/typecheck.log
artifacts/logs/unit-tests.log
artifacts/logs/build.log
artifacts/logs/e2e-predeploy.log
artifacts/logs/deploy.log
artifacts/logs/e2e-live.log
artifacts/logs/e2e-https.log
artifacts/database/*
artifacts/release/health.json
artifacts/release/backend.json
artifacts/release/headers.txt
artifacts/release/tls.txt
artifacts/release/summary.json
artifacts/screenshots/*
playwright-report/
test-results/
```

Summary должен содержать branch, exact SHA, runner, public origin, database/cache, verifiedAt и PASS/FAIL.

## Исправление красного gate

При падении:

1. найти первый причинный failed step;
2. открыть полный log/trace/screenshot;
3. воспроизвести exact environment;
4. исправить причину, а не симптом;
5. добавить/уточнить regression test;
6. отправить один новый commit;
7. дождаться нового run;
8. повторять до PASS.

Нельзя:

- отключать тест;
- увеличивать timeout без доказанной причины;
- использовать `force: true` как постоянное исправление клика;
- помечать обязательный шаг `continue-on-error`;
- вручную объявлять deploy успешным;
- ссылаться на PASS старого SHA.

## Критерий приёмки

```text
main SHA == /api/health.releaseSha
workflow conclusion == success
issue status comment == MAIN PRODUCTION PASS
public origin == https://kolibriai.online
live desktop/mobile critical paths == PASS
```
