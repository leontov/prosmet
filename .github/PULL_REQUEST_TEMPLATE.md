# Пользовательский результат

<!-- Что теперь может сделать пользователь и где это видно? Не описывайте только внутренний рефакторинг. -->

## Critical path

- [ ] Сценарий сформулирован
- [ ] Baseline/defect воспроизведён
- [ ] Regression test добавлен
- [ ] Desktop проверен
- [ ] Mobile проверен
- [ ] Offline/reload/sync проверены, если затронуты

## Архитектура и данные

- Base SHA:
- Changed boundaries:
- Schema/migration:
- Backward compatibility:
- Rollback target/plan:

- [ ] Один assistant-ui runtime сохранён
- [ ] AG-UI contract сохранён
- [ ] PostgreSQL/IndexedDB boundaries сохранены
- [ ] Browser SQL/WASM не добавлен
- [ ] Money calculations остаются deterministic/Decimal
- [ ] Tenant/owner isolation проверена
- [ ] Секреты не попали в client/events/logs/artifacts

## UX

- [ ] Нет обрезанного основного контента
- [ ] Touch targets и safe areas проверены
- [ ] Keyboard/focus проверены
- [ ] Capability controls показаны только при adapter
- [ ] Русская локализация проверена
- [ ] Reference / rendered screenshots приложены

## Проверки

```text
source-contract:
typecheck:
unit:
build:
desktop E2E:
mobile E2E:
accessibility:
visual:
performance:
security:
```

## Evidence

- Workflow/run:
- Playwright trace/report:
- Desktop screenshot:
- Mobile screenshot:
- Migration evidence:
- Live health/backend:

## Production gate

- [ ] PR merge SHA известен
- [ ] `Prosmet Main Production` PASS
- [ ] `main SHA == https://kolibriai.online/api/health.releaseSha`
- [ ] Live HTTPS desktop smoke PASS
- [ ] Live HTTPS mobile smoke PASS
- [ ] `MAIN PRODUCTION PASS` опубликован

PR не считается завершённым до выполнения production gate.
