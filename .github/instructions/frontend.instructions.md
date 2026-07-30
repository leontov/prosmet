---
applyTo: "app/**/*.tsx,app/**/*.css,components/**/*.tsx,lib/local/**/*.ts,lib/sharing/**/*.ts"
---

# Frontend, UX и local-first instructions

- Сохраняй один assistant-ui runtime и существующий AG-UI transport.
- Не создавай второй chat state/runtime.
- Основной результат сметы в чате — одна компактная карточка.
- На desktop документ — главная поверхность; supporting panels не должны его зажимать.
- На mobile используй одну поверхность, bottom/full-screen sheets, safe areas и keyboard-safe sticky footer.
- Основные touch targets ≥44×44 CSS px; input text на mobile ≥16 px.
- Не обрезай title, section title, quantity, amount и primary action.
- Не полагайся только на hover.
- Каждый icon-only control имеет доступное имя.
- Focus-visible, trap/return и reduced-motion обязательны.
- Не показывай speech, feedback, dictation или share control без реального capability.
- Не подавляй console errors CSS-скрытием их причины; исправляй capability/state.
- Русская presentation locale: `30.07.2026`, `154 767,50 ₽`, корректные единицы и plural forms.
- Изменения редактирования сохраняются оптимистически в IndexedDB/outbox и имеют offline/error state.
- Preview, PDF и XLSX используют одну доменную revision.
- Не добавляй новый UI framework и не меняй design language без решения владельца.
- Для визуальных изменений добавляй desktop/mobile screenshot evidence и visual regression.
- E2E использует user-visible role/label/testid, а не хрупкую DOM-структуру.
