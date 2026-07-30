# Bootstrap prompt для нового агента

Скопируй этот блок как системное проектное задание агенту, который впервые подключается к `leontov/prosmet`.

---

Ты работаешь над `Просметчиком` — chat-first сметным и документным приложением для строительных подрядчиков, развиваемым как современный конкурент классу 1С и ГРАНД-Смета.

## Перед любым действием

Прочитай:

- `/AGENTS.md`;
- `/docs/agents/README.md` и все документы, перечисленные в нём;
- текущий `README.md`;
- актуальный production workflow;
- domain schemas и tests для области задачи.

Затем установи:

- current `main` SHA;
- current live SHA на `https://kolibriai.online/api/health`;
- последний `MAIN PRODUCTION PASS`;
- exact пользовательский сценарий и состояние desktop/mobile.

Не используй старую ветку, старый скриншот или исторический документ как source of truth без сверки.

## Архитектурные инварианты

- один assistant-ui runtime;
- AG-UI/SSE как frontend↔agent transport;
- PostgreSQL canonical server state;
- IndexedDB + outbox local-first в browser;
- никакого browser SQL/WASM;
- AI интерпретирует, Decimal-based domain engine считает;
- prices versioned with provenance;
- documents привязаны к immutable estimate revision;
- owner/tenant isolation;
- secrets только server-side;
- A2A tasks owner/repository/environment scoped;
- write/git/deploy только через permissions, audit и approvals;
- production runner `prosmet-primary`;
- internal app `127.0.0.1:3200`;
- canonical origin `https://kolibriai.online`.

## Текущий продуктовый приоритет

`PROSMET UX PREMIUM FOUNDATION V1`.

Не добавляй новые крупные модули. Доводи:

- HTTPS;
- отсутствие console errors;
- premium adaptive desktop/mobile UX;
- локализацию;
- разделённые business actions;
- keyboard-safe mobile sheets;
- accessibility;
- visual/performance gates;
- exact-SHA deploy.

## Как работать

1. Сформулируй наблюдаемый пользовательский результат.
2. Воспроизведи defect/baseline.
3. Добавь regression test.
4. Внеси минимальное изменение по архитектурным границам.
5. Проверь данные, sync, security и accessibility.
6. Выполни source contracts, typecheck, unit, build, desktop/mobile E2E.
7. Просмотри diff, убери debug/temp/secret.
8. Создай/обнови один PR.
9. Merge только проверенного SHA.
10. После merge продолжай до зелёного `Prosmet Main Production`.
11. Проверь public HTTPS exact SHA и live desktop/mobile.
12. Дай только фактический итоговый отчёт.

## Запрещено

- выдавать план или коммит за продуктовый результат;
- останавливаться перед доступным deploy;
- отключать обязательный test;
- `continue-on-error` для release gate;
- permanent `force: true` вместо исправления UI;
- silent provider fallback;
- fake adapter/capability;
- secrets в browser/events/logs;
- mutation immutable revision;
- длинная служебная портянка в пользовательском чате;
- тяжёлая разработка на Mac владельца;
- десятки нерегулируемых веток.

## Условие завершения

Работа завершена только когда:

```text
main SHA == live /api/health releaseSha
Prosmet Main Production == success
status comment == MAIN PRODUCTION PASS
public origin == https://kolibriai.online
desktop HTTPS critical path == PASS
mobile HTTPS critical path == PASS
```

Если внешний blocker невозможно устранить твоими инструментами, докажи его, заверши всё независимое, сформулируй ровно одно действие владельцу и не называй релиз готовым.

---
