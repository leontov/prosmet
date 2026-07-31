# Просметчик — Greenfield V3

Универсальное assistant-first приложение для диалогов, расчётов, смет, документов и подключения внешних AI-агентов.

> Это чистая кодовая база. Старые shell, страницы, CSS-слои и демонстрационные сметы удалены. Пустое состояние остаётся пустым, пока пользователь или подключённый агент не создаст реальный результат.

Каноническая production-ветка: `main`. Публичный адрес: `https://kolibriai.online`.

## Продуктовые поверхности

- **Desktop Web** — лаконичная Codex/GPT-like оболочка, чат как главный рабочий процесс, библиотеки и полноэкранный редактор результата.
- **Mobile Web** — самостоятельный экран по предоставленному Chat-референсу: верхнее меню, центральный выбор раздела, большая рабочая область, быстрые действия и pill composer; постоянной нижней навигации нет.
- **iOS / Android** — отдельное Expo / React Native приложение с той же мобильной информационной архитектурой.
- **Desktop Native** — Tauri 2 shell для macOS, Windows и Linux.
- **Расчётный контур** — независимый Rust crate без AI-зависимостей.
- **Agent control plane** — server-side реестр подключений, выбор активного агента, защищённая административная настройка и единый результат для всех клиентов.

## Реальные agent adapters

Поддержаны:

- OpenAI-compatible `/chat/completions`;
- Ollama `/api/chat`;
- Codex App Server через JSON-RPC/JSONL stdio;
- AG-UI gateway;
- A2A gateway.

Секреты не попадают в браузер или мобильное приложение. Server-side credentials шифруются AES-256-GCM, а изменение подключений защищено `PROSMET_ADMIN_TOKEN`.

В production отсутствует fake fallback: при недоступном агенте интерфейс показывает фактическую ошибку, а не подставляет заранее заготовленную смету.

Подробный контракт: [`docs/AGENT_INTEGRATION.md`](docs/AGENT_INTEGRATION.md).

## Технологии

- React 19.2 + Vite 8 для web;
- assistant-ui primitives и LocalRuntime;
- Expo SDK 57 / React Native 0.86 для iOS и Android;
- Tauri 2 для desktop;
- Rust для детерминированного расчёта;
- TypeScript 6;
- Playwright, Vitest и Node Test Runner.

## Быстрый старт

```bash
npm install --legacy-peer-deps
npm run dev
```

Web откроется на `http://localhost:5173`.

Полная проверка:

```bash
npm run verify
npm run e2e
```

Playwright поднимает изолированный OpenAI-compatible fixture, но запрос проходит через настоящий production router, adapter, function tool и серверную проверку сметы. Встроенная демонстрационная смета не используется.

## Структура

```text
apps/web                    web UI, Node production server и agent adapters
apps/mobile                 отдельное Expo / React Native приложение
apps/desktop                Tauri shell
packages/contracts          общие типы и API-контракты
crates/estimate-engine      Rust-движок расчёта
docs                        архитектура, дизайн-система и agent integration
scripts/greenfield-contract release contract без legacy UI и заглушек
```

## Agent API

```text
GET  /api/health
GET  /api/identity
GET  /api/agents
POST /api/agent
```

Защищённые endpoints супер-администратора:

```text
GET    /api/admin/agents
POST   /api/admin/agents
PUT    /api/admin/agents/:id
DELETE /api/admin/agents/:id
POST   /api/admin/agents/:id/activate
POST   /api/admin/agents/:id/test
```

## Production contract

`scripts/greenfield-contract.mjs` останавливает релиз, если:

- возвращается legacy UI;
- возвращается постоянная нижняя мобильная навигация;
- появляются demo/fake estimate data или фиктивные пользователи, устройства и провайдеры;
- отсутствует любой обязательный agent adapter;
- секреты перестают храниться server-side;
- production release не включает server modules;
- процесс снова становится дочерним процессом GitHub Runner cleanup.

Работа считается опубликованной только после деплоя точного SHA `main` на `https://kolibriai.online`, public health и agent registry PASS, проверки сохранения процесса после runner cleanup и desktop/mobile Chromium с внешнего GitHub-hosted runner.
