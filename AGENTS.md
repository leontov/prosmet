# AGENTS.md — обязательный контракт агентной разработки Просметчика

Этот файл действует для всего репозитория `leontov/prosmet`. Любой ИИ-агент, разработчик, reviewer, release-агент или автоматизация обязаны прочитать его до изменения кода. Более локальный `AGENTS.md` может уточнять правила своей директории, но не может ослаблять этот контракт.

## 1. Миссия и неизменяемый контекст

**Продукт:** «Просметчик» — chat-first система строительных смет, цен и документов, развиваемая как современная альтернатива тяжёлым решениям класса 1С и ГРАНД-Сметы.

**Репозиторий:** `leontov/prosmet`.

**Production source of truth:** ветка `main`.

**Production:**

- публичный origin: `https://kolibriai.online`;
- внутренний listener: `http://127.0.0.1:3200`;
- Primary IPv4: `78.17.4.108`;
- единственный production runner: `prosmet-primary`;
- release workflow: `.github/workflows/launch-3200.yml` (`Prosmet Main Production`).

**Главное правило завершения:** изменение не считается готовым по коммиту, локальной сборке, скриншоту или внутреннему деплою. Готовность наступает только после `MAIN PRODUCTION PASS` для точного SHA из `main`, проверки публичного HTTPS origin и сохранения release evidence.

## 2. Иерархия источников истины

При противоречии используй следующий порядок:

1. этот `AGENTS.md`;
2. `docs/PRODUCT_SPEC_AND_ROADMAP.md`;
3. `docs/UX_PREMIUM_FOUNDATION_V1.md`;
4. `docs/A2A_DEVELOPER_MODE.md`;
5. `docs/AGENT_ENGINEERING_PLAYBOOK.md`;
6. `README.md`;
7. source contracts, миграции, tests и production workflow;
8. текущий код;
9. старые отчёты, архивные ветки и документы — только как исторический контекст.

Нельзя переносить в текущий продукт статус, архитектуру или зависимости из других репозиториев без проверки. Старый отчёт про `rd8r8bkd9m-tech/kolibri-project-main`, SQLite и ветку `app/assistant-ui-local-first-v1` не является текущим состоянием `leontov/prosmet`.

## 3. Архитектурные инварианты

Нельзя нарушать без отдельного owner-approved ADR и зелёного release gate:

- `assistant-ui` владеет chat runtime, composer, сообщениями, запуском, редактированием и tool UI;
- перед изменениями assistant-ui сверяйся с актуальными `https://www.assistant-ui.com/llms.txt` и `https://www.assistant-ui.com/llms-full.txt`;
- официальный skill bundle при необходимости устанавливается через `npx skills add assistant-ui/skills --skill '*' --agent codex --copy --yes`;
- `AG-UI` — единственный потоковый протокол frontend ↔ agent backend;
- один корневой assistant runtime, без параллельного самодельного chat runtime;
- PostgreSQL — серверный source of truth;
- IndexedDB — локальный browser cache и offline outbox;
- browser SQLite, SQL.js, PGlite, SQLite-WASM, `unsafe-eval` и WASM eval запрещены;
- tenant isolation и owner scoping обязательны для workspace, providers, estimates, documents, prices, sync и A2A tasks;
- технологическая карта формируется до сметы;
- итог сметы считается детерминированным движком, а не текстом модели;
- история цены неизменяема; новая стадия создаёт observation, а не перезаписывает старую;
- служебные артефакты сохраняются, но не превращают пользовательский чат в длинную портянку;
- клиентский результат расчёта — компактная карточка сметы;
- desktop и mobile используют одну доменную модель, но адаптивную композицию;
- секреты остаются только на сервере и не возвращаются в браузер, prompt, A2A message, artifact, лог или screenshot.

## 4. Текущий продуктовый приоритет

До закрытия `PROSMET UX PREMIUM FOUNDATION V1` запрещено добавлять новые большие продуктовые модули.

Приоритет:

1. HTTPS на `kolibriai.online`;
2. ноль production console errors;
3. скрытие ненастроенных capabilities;
4. premium adaptive shell;
5. отсутствие clipping/overflow title, section, quantity, totals;
6. русская локализация дат, чисел, валюты и единиц;
7. mobile sticky primary actions;
8. раздельные действия `Сохранить версию / Утвердить / Передать клиенту`;
9. keyboard-safe row editor;
10. WCAG, visual regression и performance gates;
11. desktop/mobile E2E;
12. exact-SHA deploy и live HTTPS evidence.

Не заменяй этот список редизайном, новым кабинетом, новой аналитикой, маркетинговым экраном или инфраструктурной перестройкой, не устраняющей текущий blocker.

## 5. Обязательный рабочий цикл агента

### 5.1. Сначала факты

Перед изменением:

1. прочитай этот файл и релевантные документы;
2. зафиксируй exact `main` SHA;
3. найди последний workflow run;
4. прочитай failed job и конкретный step/log;
5. проверь live `/api/health`, если релиз уже развёрнут;
6. сформулируй один наблюдаемый blocker.

Запрещено начинать с нового общего плана, если красный gate уже показывает конкретную ошибку.

### 5.2. Исправляй минимальный реальный blocker

- меняй минимальный набор файлов;
- не маскируй ошибку отключением теста;
- не превращай failure в warning;
- не ослабляй security или tenancy ради зелёного цвета;
- не подменяй реальную интеграцию фиктивным PASS;
- добавляй regression test или source contract для устранённого класса ошибок;
- при новой ошибке читай новый лог и продолжай цикл.

### 5.3. Не останавливайся на отчёте

Промежуточный отчёт допустим только как короткая фиксация текущего blocker. Нельзя завершать проход фразами «осталось», «нужно сделать», «пока нельзя считать готовым», если исправление возможно в текущем контуре.

Цикл:

`observe → reproduce → fix → verify → deploy → live verify → evidence`

повторяется до `MAIN PRODUCTION PASS` либо до подтверждённого внешнего blocker, который невозможно устранить из репозитория или доступных adapters. Внешний blocker должен иметь машинное доказательство, точное требуемое действие и fail-closed статус.

## 6. Git и управление изменениями

Текущая owner policy:

- `main` — единственная production ветка и source of truth;
- не создавай десятки долгоживущих веток;
- небольшие owner-approved release fixes допускаются прямо в `main`;
- branch/PR используй для крупного рискованного изменения, миграции или явного запроса владельца;
- не deploy feature branch;
- не force-push `main`;
- каждый commit должен быть малым, обратимым и объяснять наблюдаемый результат;
- не смешивай unrelated refactor с исправлением gate;
- не изменяй чужие сервисы и порты; порт `3100` занят другим приложением, Prosmet использует `3200`.

## 7. Release gate

Минимальный обязательный контур:

```text
npm ci
→ persistent PostgreSQL
→ DATABASE_URL probe
→ idempotent migration
→ npm run source:contract
→ npm run typecheck
→ npm run test
→ npm run build
→ desktop Chromium
→ mobile Chromium
→ absence of browser SQL/WASM
→ immutable deploy to 3200
→ exact internal SHA
→ internal live smoke
→ HTTPS edge
→ exact public SHA
→ HTTP→HTTPS redirect
→ HSTS/CSP checks
→ live HTTPS desktop/mobile smoke
→ evidence artifact
→ MAIN PRODUCTION PASS
```

Ни один skipped step после первого failure не считается проверенным.

## 8. UX и доступность

Обязательные правила:

- стиль спокойный, минималистичный, ChatGPT/Codex-like;
- один главный результат на сообщение;
- итоговая цена видна сразу;
- прогрессивное раскрытие деталей;
- no horizontal page scroll для сметы;
- touch target минимум `44px` для частых действий;
- `<768px`: одна основная поверхность;
- `768–1023px`: navigation rail + одна поверхность;
- `1024–1279px`: документ заменяет supporting chat;
- `>=1280px`: navigation + estimate + chat при достаточной ширине;
- keyboard focus видим и не скрыт sticky-панелями;
- dialogs/sheets имеют focus management, safe area и reduced motion;
- ненастроенные speech/feedback capabilities не рендерятся;
- кнопка без рабочего поведения запрещена;
- мобильная клавиатура не закрывает активное поле и primary action;
- даты, числа, валюта и plural forms локализуются для `ru-RU`.

## 9. Сметный и документный домен

Для любого расчёта соблюдай порядок:

`исходные данные → технологическая карта → ресурсы → цены → детерминированная смета → review → версия → утверждение → документы`

Обязательно:

- работы, материалы, оборудование, механизмы, логистика и отходы выводятся из технологии;
- у цены есть источник, регион, дата, валюта, НДС, доставка, confidence и status;
- личная/организационная/подтверждённая цена имеет приоритет над ориентировочной;
- утверждённая, отправленная, договорная и фактическая цена сохраняются отдельными событиями;
- PDF/XLSX и preview строятся из одной версии доменной модели;
- документы создаются из утверждённой версии, не из случайного draft;
- AI объясняет и структурирует, но не заменяет расчётный движок.

## 10. A2A и режим разработчика

A2A используется для task lifecycle и взаимодействия самостоятельных агентов, а не как декоративный список.

Роли:

- Kolibri Coordinator;
- Product Architect;
- Frontend Engineer;
- Backend Engineer;
- React Native Engineer;
- Estimate & Documents Expert;
- QA Engineer;
- Release Engineer;
- Security Engineer.

Роль не выдаёт право. Права выдаются на task и scope по ladder:

`discover → read → propose → code → test → git → deploy`

Обязательные ограничения:

- агент не self-approve;
- code/test/git/deploy разделены;
- shell только через allowlisted executor;
- Git adapter работает с exact base SHA;
- release adapter не обходит основной workflow;
- failed gate возвращает задачу в работу;
- task должен переживать закрытие чата в целевой durable реализации;
- internal chain-of-thought не публикуется; сохраняются решения, действия, evidence и краткие rationale.

## 11. Безопасность

Запрещено:

- коммитить API keys, cookies, SSH keys, database passwords или provider secrets;
- использовать ключ, присланный для временного теста, как постоянный;
- выводить секрет в лог, screenshot, artifact или сообщение;
- отключать tenancy/authorization ради теста;
- копировать общий приватный ключ на fleet;
- выполнять destructive migration без backup/rollback plan и отдельного approval;
- удалять чужой процесс по одному номеру порта без проверки ownership;
- публиковать внутренние IP и пути в публичном Agent Card;
- silent fallback для code/deploy задачи;
- выдавать незапущенный URL как рабочий.

## 12. Evidence и итоговый отчёт

Каждый законченный релиз должен иметь:

- exact commit SHA;
- workflow run ID;
- runner name;
- список обязательных gates и их PASS;
- health/backend/workspace/provider evidence;
- PostgreSQL driver/connection evidence;
- desktop и mobile screenshots;
- public HTTPS headers, redirect и TLS status;
- live E2E logs;
- release summary artifact;
- публичный URL только после успешного health-check.

Финальный ответ владельцу содержит факты, а не обещания:

```text
MAIN PRODUCTION PASS
Commit: <sha>
Run: <id>
App: https://kolibriai.online/
Health: exact SHA confirmed
Desktop/mobile live smoke: PASS
```

## 13. Команды

```bash
npm ci --no-audit --no-fund
npm run source:contract
npm run typecheck
npm run test
npm run build
npm run e2e
```

Production release запускается только существующим workflow `Prosmet Main Production`. Ручной процесс на `3200` не является заменой production gate.

## 14. Перед каждым завершением

Проверь:

- [ ] решена исходная пользовательская боль, а не только внутренний код;
- [ ] нет нового модуля вне текущего release scope;
- [ ] source contracts PASS;
- [ ] typecheck PASS;
- [ ] unit PASS;
- [ ] build PASS;
- [ ] desktop/mobile PASS;
- [ ] production exact SHA PASS;
- [ ] public HTTPS PASS;
- [ ] live screenshots/evidence сохранены;
- [ ] `MAIN PRODUCTION PASS` опубликован.

Если последний пункт не выполнен, работа продолжается.