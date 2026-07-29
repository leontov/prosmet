# Просметчик

Профессиональная chat-first система для строительных смет и документов.

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
- один и тот же проверенный commit из `main` разворачивается runner `prosmet-primary` на `78.17.4.108:3200`.

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
→ source contracts
→ TypeScript strict
→ unit tests
→ production build
→ Chromium desktop/mobile
→ Editor V2 workflow
→ IndexedDB reload/offline
→ outbox → PostgreSQL → pull
→ Price Intelligence history
→ PDF/XLSX validation
→ immutable deployment
→ exact live SHA
→ live desktop/mobile smoke
```

Красный gate не публикуется на `3200`. Проход считается завершённым только после `MAIN PRODUCTION PASS` для точного SHA из `main`.
