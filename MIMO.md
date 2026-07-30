# MiMo repository instructions

Для этого репозитория обязательным контрактом является [`AGENTS.md`](./AGENTS.md).

Перед анализом, кодом или запуском инструментов:

1. прочитай `AGENTS.md` полностью;
2. прочитай `docs/PROJECT_SOURCE_OF_TRUTH.md` и `docs/AGENT_CONTEXT_INDEX.md`;
3. открой `docs/AGENT_ENGINEERING_PLAYBOOK.md`;
4. загрузи релевантные product/UX/A2A contracts;
5. получи exact `main` SHA и последний `Prosmet Main Production` failure log;
6. исправляй только доказанный blocker и продолжай цикл до `MAIN PRODUCTION PASS`.

Не создавай второй chat runtime, не заменяй AG-UI, не возвращай browser SQLite/WASM, не добавляй новый продуктовый модуль вне активного release scope и не выдавай план/commit/local PASS за готовый production. Публичный результат проверяется только на `https://kolibriai.online` для точного SHA из `main`.
