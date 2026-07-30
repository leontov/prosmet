## Пользовательский результат

<!-- Что изменится для реального пользователя? Не перечисляйте только файлы/коммиты. -->

## Verified blocker

- Base SHA:
- Workflow run/job:
- Failed step:
- Exact error/probe:

## Scope

### Изменено

-

### Не изменено

- [ ] Новые продуктовые модули не добавлены
- [ ] assistant-ui/AG-UI архитектура не заменена
- [ ] PostgreSQL/IndexedDB authority contract сохранён
- [ ] Tenancy/security/CSP не ослаблены
- [ ] Secrets не добавлены

## Acceptance

- [ ] Source contracts
- [ ] TypeScript strict
- [ ] Unit tests
- [ ] Production build
- [ ] Desktop Chromium
- [ ] Mobile Chromium
- [ ] Accessibility/focus/touch/safe-area checks
- [ ] No production console errors
- [ ] No browser SQL/WASM/eval
- [ ] PostgreSQL migration/connection
- [ ] Exact internal release SHA
- [ ] Public HTTPS exact release SHA
- [ ] HTTP→HTTPS redirect
- [ ] HSTS/CSP
- [ ] Live desktop smoke
- [ ] Live mobile smoke
- [ ] Evidence artifact

## UX evidence

- Desktop screenshot:
- Mobile screenshot:
- Row/dialog state screenshot:
- Viewports checked:
- Clipping/overflow result:
- Keyboard/focus result:

## Data and domain evidence

- Deterministic totals unchanged/verified:
- Price provenance/history verified:
- Estimate revision behavior verified:
- PDF/XLSX verified when affected:

## Security review

- Permission required:
- Tenant/owner scope:
- Secret handling:
- Rollback:

## Release

```text
MAIN PRODUCTION: PENDING
Commit: <sha>
Run: <id>
App: https://kolibriai.online/
```

PR нельзя считать завершённым, пока статус не станет:

```text
MAIN PRODUCTION PASS
Exact SHA confirmed
Desktop/mobile live smoke PASS
```