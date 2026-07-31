# Просметчик — Greenfield V3

Универсальное assistant-first приложение для диалогов, расчётов, смет, документов и подключения внешних AI-агентов.

> Кодовая база создана как чистое Greenfield-дерево. Старые shell, страницы, CSS-слои, демонстрационные сметы и фиктивные ответы в production не используются.

Каноническая production-ветка: `main`. Публичный адрес: `https://kolibriai.online`.

## Продуктовые поверхности

- **Desktop Web** — лаконичная Codex/GPT-like оболочка, чат как основной рабочий процесс, библиотеки реальных данных и полноэкранный редактор результата.
- **Mobile Web** — отдельная мобильная композиция без постоянной нижней навигации; разделы открываются по запросу, смета редактируется крупными карточками.
- **iOS / Android** — отдельное Expo/React Native-приложение с assistant-ui primitives и SecureStore.
- **Desktop Native** — Tauri 2 shell для macOS, Windows и Linux.
- **Расчётный контур** — независимый Rust crate без AI-зависимостей.
- **Agent control plane** — серверный реестр провайдеров, тестирование, переключение активного агента и зашифрованные секреты.

## Поддерживаемые интеграции агентов

| Тип | Назначение | Протокол |
|---|---|---|
| OpenAI-compatible | OpenAI API, MiMo gateway и совместимые сервисы | `POST /chat/completions` |
| Ollama | локальные модели | `POST /api/chat` |
| Codex App Server | полноценный Codex runtime | JSONL/stdio: `initialize → thread/start → turn/start → events` |
| HTTP agent | любой собственный агентный сервис | универсальный JSON request/response contract |

UI не содержит встроенного «ответа-заглушки». Пока активный агент не подключён, чат возвращает понятную ошибку конфигурации. Смета открывается только из фактического ответа провайдера.

## Управление агентами

Супер-администратор может из web- или mobile-настроек:

1. добавить подключение;
2. сохранить API key/token;
3. проверить соединение;
4. активировать нужного агента;
5. изменить или удалить подключение.

Секреты шифруются на сервере через AES-256-GCM и не возвращаются клиенту. В мобильном приложении API URL и администраторский токен хранятся в Expo SecureStore.

### Bootstrap супер-администратора

Для production предпочтительно передать токен процессу через переменную:

```bash
PROSMET_ADMIN_TOKEN='<длинный случайный токен>'
```

Когда переменная отсутствует, сервер создаёт токен один раз и сохраняет его с правами `0600`:

```text
$HOME/.prosmet-greenfield/config/admin.token
```

Реестр агентов и ключ шифрования расположены рядом:

```text
$HOME/.prosmet-greenfield/config/agents.json
$HOME/.prosmet-greenfield/config/agents.key
```

Эти файлы нельзя включать в Git, browser bundle или GitHub Actions artifacts.

## Универсальный HTTP-agent contract

Запрос:

```json
{
  "messages": [
    { "role": "user", "content": "Составь смету..." }
  ],
  "instructions": "системный контракт приложения",
  "responseSchema": {},
  "context": {
    "application": "prosmet-greenfield",
    "releaseSha": "..."
  }
}
```

Ответ без документа:

```json
{
  "text": "Уточните регион и объём",
  "artifact": null,
  "estimate": null
}
```

Ответ со сметой:

```json
{
  "text": "Смета подготовлена",
  "artifact": "estimate",
  "estimate": {
    "id": "...",
    "title": "...",
    "project": "...",
    "customer": "...",
    "region": "...",
    "revision": 1,
    "status": "draft",
    "overheadPercent": 0,
    "profitPercent": 0,
    "vatPercent": 0,
    "updatedAt": "2026-07-31T00:00:00.000Z",
    "sections": []
  }
}
```

Production server проверяет структуру и не открывает невалидный документ.

## Технологии

- React 19.2 + Vite 8;
- assistant-ui LocalRuntime;
- Expo SDK 57 / React Native 0.86;
- Expo SecureStore;
- Tauri 2;
- Rust;
- TypeScript 6;
- Playwright и Vitest.

## Быстрый старт

```bash
npm install --workspaces --include-workspace-root --legacy-peer-deps
npm run dev
```

Web откроется на `http://localhost:5173`.

Полная проверка:

```bash
npm run verify
npm run desktop:metadata
npx playwright install chromium
npm run e2e
```

Локальный E2E поднимает отдельный HTTP-agent fixture и подключает его через тот же публичный admin API, которым пользуется production UI. Fixture не входит в production runtime.

## Структура

```text
apps/web                 web-интерфейс, API и production static server
apps/mobile              отдельное Expo-приложение
apps/desktop             Tauri shell
packages/contracts       общие типы и API-контракты
crates/estimate-engine   Rust-движок расчёта
deployment               постоянный process/HTTPS recovery
docs                     архитектура и дизайн-система
```

## Release gates

`scripts/greenfield-contract.mjs` отклоняет сборку, если возвращаются:

- legacy UI;
- demo estimate files;
- hardcoded пользователи, объекты или устройства;
- fake responder;
- неработающие export/share controls;
- отсутствие provider adapters или зашифрованного secret storage;
- временный Node/Caddy-процесс, который GitHub Runner уничтожит после job.

Работа считается опубликованной только после деплоя точного SHA `main`, post-cleanup process PASS, public edge PASS и desktop/mobile Chromium против `https://kolibriai.online` с внешнего GitHub-hosted runner.
