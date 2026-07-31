# Просметчик — Greenfield V3

Новая кодовая база универсального AI-приложения для расчётов, смет, документов и работы с агентами.

> Этот проект создан как чистое дерево Git. В нём нет старого shell, старых страниц, старых CSS-файлов и компонентов прежнего интерфейса. Из предыдущей реализации разрешён перенос только проверенных контрактов данных, API и расчётной логики.

## Продуктовые поверхности

- **Desktop Web** — лаконичная Codex/GPT-like оболочка, чат как основной рабочий процесс, отдельные библиотеки и полноэкранный редактор результата.
- **Mobile** — самостоятельная нативная информационная архитектура: крупные карточки, нижняя навигация, полноэкранная смета и закреплённые действия.
- **Desktop Native** — Tauri 2 shell для macOS, Windows и Linux.
- **Расчётный контур** — независимый Rust crate без AI-зависимостей.
- **Agent boundary** — единый runtime-адаптер; UI не привязан к конкретной модели.

## Технологии

- React 19.2 + Vite 8 для web;
- assistant-ui primitives и LocalRuntime;
- Expo SDK 57 / React Native 0.86 для iOS и Android;
- Tauri 2 для desktop;
- Rust для детерминированного расчёта;
- TypeScript 6;
- Playwright и Vitest.

## Быстрый старт

```bash
npm install --legacy-peer-deps
npm run dev
```

Web откроется на `http://localhost:5173`.

```bash
npm run verify
npm run e2e
```

## Структура

```text
apps/web       новый web-интерфейс и production static server
apps/mobile    отдельное Expo-приложение
apps/desktop   Tauri shell
packages/contracts  общие типы и API-контракты
crates/estimate-engine  Rust-движок расчёта
docs           архитектура и дизайн-система
```

## Greenfield-контракт

`scripts/greenfield-contract.mjs` останавливает сборку, если в проект возвращаются legacy UI-файлы, селекторы или названия прежней оболочки.

Работа считается опубликованной только после merge в `main`, деплоя точного SHA на `https://kolibriai.online`, public health PASS и desktop/mobile браузерного сценария.
