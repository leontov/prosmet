# ProSmet — Kolibri Смета

AI-first строительная сметная система, где **чат является операционной системой продукта**. Пользователь описывает задачу обычным языком; Chief Estimator сначала формирует технологическую карту, затем создаёт редактируемую смету, проверяет её независимым reviewer и продолжает работу в том же thread.

## Уже работает в этой ветке

- Next.js App Router, React, strict TypeScript и Tailwind CSS.
- Настоящий `assistant-ui` с AG-UI runtime и единственным `POST /api/agent`.
- Стандартные AG-UI lifecycle, message, tool, state и activity events.
- Безопасный work trace без chain-of-thought.
- Вертикальный сценарий «штукатурка 358 м² → технологическая карта → смета → reviewer».
- Интерактивный `estimate_draft` прямо в сообщении: количество, цена, коэффициент, название и единица.
- Детерминированный пересчёт, immutable revisions, IndexedDB outbox и SQLite-WASM mirror.
- Branch picker, edit/regenerate/cancel, starter suggestions, реальные вложения, browser voice, мобильный shell и PWA service worker.
- PostgreSQL/Drizzle tenant-ready schema и server-side provider interfaces.
- 52 AI eval cases, unit/integration tests, Playwright desktop/mobile и self-hosted Primary workflow.

## Запуск

```bash
cp .env.example .env.local
npm install
npm run dev
```

Проверки:

```bash
npm run source:contract
npm run typecheck
npm run test
npm run build
npm run test:e2e:install
npm run test:e2e
```

## Важный статус

Эта ветка содержит **первый работающий вертикальный срез**, а не ложное заявление о завершении всего большого ТЗ. MiMo credentials/runtime, Better Auth UI, серверная синхронизация PostgreSQL, PDF/XLSX/DOCX и анализ содержимого импортированных файлов и полный набор документов требуют подключения инфраструктуры и последующих release slices. Неподключённые возможности не подменяются fixture и не показывают fake success.

Подробности: [`docs/RELEASE_EVIDENCE.md`](docs/RELEASE_EVIDENCE.md).
