# Просметчик

Профессиональная chat-first система для строительных смет и документов.

## Инструкции для ИИ-агентов

Любая агентная разработка начинается с [`AGENTS.md`](./AGENTS.md). Канонический комплект:

- [`docs/PROJECT_SOURCE_OF_TRUTH.md`](./docs/PROJECT_SOURCE_OF_TRUTH.md) — требования, фактическое состояние, production truth и legacy;
- [`docs/AGENT_CONTEXT_INDEX.md`](./docs/AGENT_CONTEXT_INDEX.md) — индекс обязательного контекста;
- [`docs/AGENT_BOOTSTRAP_PROMPT.md`](./docs/AGENT_BOOTSTRAP_PROMPT.md) — единый стартовый prompt;
- [`docs/AGENT_ENGINEERING_PLAYBOOK.md`](./docs/AGENT_ENGINEERING_PLAYBOOK.md) — цикл observe → reproduce → fix → release;
- [`docs/AGENT_TASK_TEMPLATE.md`](./docs/AGENT_TASK_TEMPLATE.md) — task/evidence schema;
- [`docs/WRITE_ACTIONS_RECOVERY.md`](./docs/WRITE_ACTIONS_RECOVERY.md) — восстановление connector/GitHub/Actions write access;
- [`docs/PRODUCT_SPEC_AND_ROADMAP.md`](./docs/PRODUCT_SPEC_AND_ROADMAP.md) — полное ТЗ и roadmap;
- [`docs/UX_PREMIUM_FOUNDATION_V1.md`](./docs/UX_PREMIUM_FOUNDATION_V1.md) — текущий UX/HTTPS release contract;
- [`docs/A2A_DEVELOPER_MODE.md`](./docs/A2A_DEVELOPER_MODE.md) — A2A roles, permissions и execution architecture.

Точки входа конкретных агентов: [`CLAUDE.md`](./CLAUDE.md), [`GEMINI.md`](./GEMINI.md), [`MIMO.md`](./MIMO.md) и [`.github/copilot-instructions.md`](./.github/copilot-instructions.md). Они обязаны ссылаться на один корневой контракт, а не создавать собственную архитектуру.

Instruction contract входит в `npm run source:contract`. Работа агента считается завершённой только после `MAIN PRODUCTION PASS` exact SHA из `main` на `https://kolibriai.online`.

## Архитектурный контракт

- интерфейс в стиле ChatGPT/Codex;
- `assistant-ui` — runtime чатов, composer, вложений и интерактивных tool UI;
- `AG-UI` — единственный потоковый протокол frontend ↔ agent backend;
- технологическая карта формируется до сметы;
- смета появляется в чате компактной карточкой и открывается как печатный редактируемый документ;
- пользователь редактирует название, разделы, позиции, единицы, количество и цену, а итог пересчитывается детерминированно;
- orchestration runtime различает создание, изменение, сравнение, исполнение, документы и нехватку исходных данных, не создавая случайную новую смету;
- после действия «Готово» в том же чате появляется предпросмотр сохранённой версии;
- Price Intelligence хранит предложенные, изменённые, утверждённые, отправленные, договорные и фактические цены как неизменяемые наблюдения;
- локальный кэш и offline outbox работают на нативном IndexedDB без SQL.js, SQLite-WASM и browser `eval`;
- PostgreSQL является серверным источником истины и хранит tenant-scoped сметы, ревизии, документы, цены, синхронизацию и agent runs;
- Relay синхронизирует IndexedDB ↔ PostgreSQL с idempotency, cursor и сохранением ревизий;
- один и тот же проверенный commit из `main` разворачивается runner `prosmet-primary` на внутреннем порту `3200` и публикуется через `https://kolibriai.online`.

## Estimate Editor V2

Рабочий путь пользователя:

```text
сообщение в чате
→ технологическая карта
→ компактная карточка сметы
→ печатный fullscreen-редактор
→ мгновенный пересчёт и автосохранение
→ новая неизменяемая версия
→ предпросмотр в чате
→ PDF / XLSX / системная отправка клиенту
```

## Price Intelligence

Приоритет подбора цены:

1. личная подтверждённая цена;
2. цена организации;
3. согласованная предыдущая смета;
4. цена поставщика;
5. региональная агрегированная цена;
6. официальный или лицензированный источник;
7. проверенное внешнее исследование;
8. ориентировочная цена с предупреждением.

Система не перезаписывает историю цены. Каждая стадия сохраняется отдельно:

```text
researched → suggested → edited → approved → sent_to_client → contracted → executed
```

## Release gate

```text
npm ci
→ persistent PostgreSQL
→ DATABASE_URL probe
→ idempotent PostgreSQL migration
→ source contracts, включая agent instructions contract
→ TypeScript strict
→ unit tests
→ production build
→ Chromium desktop/mobile
→ Editor V2 workflow
→ IndexedDB reload/offline
→ outbox → PostgreSQL → pull
→ Price Intelligence history
→ PDF/XLSX validation
→ immutable deployment на 3200
→ exact internal SHA
→ HTTPS edge kolibriai.online
→ exact public SHA
→ live desktop/mobile smoke
```

Красный gate не принимается как релиз. Проход считается завершённым только после `MAIN PRODUCTION PASS` для точного SHA из `main`.
