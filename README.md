# Просметчик

Новая профессиональная chat-first система для строительных смет и документов.

## Архитектурный контракт

- интерфейс в стиле ChatGPT/Codex;
- `assistant-ui` — runtime чатов, composer, вложений и tool UI;
- `AG-UI` — единственный потоковый протокол frontend ↔ agent backend;
- технологическая карта формируется до сметы;
- расчёты, коэффициенты, начисления и quality gate выполняются детерминированно;
- локальная SQLite WASM-база хранит чаты, сметы, версии, документы, файлы и подтверждённые цены;
- Relay запрашивается только при локальном промахе и изолирован по tenant;
- один и тот же проверенный commit разворачивается на runner `prosmet-primary` и сервер `78.17.4.108`.

## Release gate

`npm ci → source contract → typecheck → unit tests → production build → Chromium desktop/mobile → вложение файла → технологическая карта → смета → редактирование → утверждение → повторное использование локальной цены → offline reopen → документ → PDF/XLSX → Relay isolation → контрольные скриншоты → HTTPS deployment`.
