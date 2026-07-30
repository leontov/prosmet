---
applyTo: "e2e/**/*.ts,**/*.test.ts,scripts/**/*.mjs,.github/workflows/**/*.yml"
---

# Tests, contracts и release gate

- Test проверяет наблюдаемый инвариант и падает по нужной причине.
- Не исправляй красный gate отключением теста, `continue-on-error`, silent fallback или ссылкой на старый SHA.
- Source contract устойчив к formatter и не зависит от одного переноса строки.
- Unit tests deterministic; arbitrary sleep запрещён.
- E2E selectors: role, accessible label или stable testid.
- Не использовать постоянный `force: true` для скрытия layout/stacking defect.
- Ожидать фактическое состояние (`expect.poll`, response, persisted record), а не фиксированную паузу.
- Каждый critical path проходит desktop и mobile Chromium.
- Собирать console errors, page errors и crashes; allowlist только точечный и документированный.
- Проверять reload, offline/outbox, second-device sync, PDF/XLSX, share, cancel и exact revision.
- Visual regression включает контрольные mobile/tablet/desktop viewport и ключевые sheets/dialogs.
- Accessibility gate включает keyboard focus, trap/return, sticky occlusion, target sizes и reduced motion.
- Performance gate проверяет Web Vitals/long tasks/autosave/open-sheet latency и bundle regression.
- Workflow checkout, build, deploy и public health относятся к одному exact SHA.
- Production завершён только при `MAIN PRODUCTION PASS` и `main SHA == live releaseSha` на `https://kolibriai.online`.
- Artifact загружается и при failure; первый причинный failed step исправляется до нового run.
