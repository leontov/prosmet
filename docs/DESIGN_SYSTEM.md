# Дизайн-система ProSmet

## Источники истины

1. Визуальные мобильные прототипы, утверждённые владельцем продукта.
2. Архитектура и headless-primitives assistant-ui: `https://www.assistant-ui.com/llms.txt`.
3. Автоматический контракт `scripts/assistant-ui-style-contract.mjs`.

Интерфейс не копирует готовую тему assistant-ui. Библиотека задаёт доступное поведение, состояния и runtime-контракт; визуальный слой ProSmet задаётся общей системой токенов ниже.

## Архитектурные правила assistant-ui

- Чат строится из `ThreadPrimitive`, `ComposerPrimitive`, `MessagePrimitive` и `ActionBarPrimitive`.
- UI читает и меняет состояние только через assistant-ui runtime context.
- Интеграция агента реализуется через `ChatModelAdapter` и `useLocalRuntime`.
- Диктовка, синтез речи и feedback подключаются runtime adapters, а не параллельными самописными состояниями.
- Время ответа передаётся в `message.metadata.timing` и читается через API assistant-ui.
- Web и React Native используют одинаковую семантику сообщений, композера и runtime, но отдельную платформенную разметку.
- Нельзя добавлять второй источник состояния чата, ручной DOM event-bus для timing или дублирующую модель сообщений.

## Характер

Лаконичный, спокойный, профессиональный assistant-first продукт. Основа — открытый белый canvas, системная типографика, крупные touch-targets, тонкие контуры и минимальное количество декоративных поверхностей.

## Общие визуальные токены

- Canvas: `#ffffff`
- Soft surface: `#f1f1f2`
- Sidebar: `#f4f4f5`
- Primary text: `#111214`
- Secondary text: `#66676a`
- Faint text: `#9a9b9e`
- Border: `rgba(17, 18, 20, 0.12)`
- Strong outline: `rgba(17, 18, 20, 0.78)`
- Assistant action blue: `#0a84ff`
- Success: `#177245`
- Danger: `#b42318`

Зелёный используется только как семантический success-status. Синим выделяется только основное действие отправки или активный voice-state.

## Типографика

- iOS: системная San Francisco через системный stack.
- Android: системная гарнитура платформы с теми же размерами и ритмом.
- Web: `-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `SF Pro Text`, `Segoe UI`, `sans-serif`.
- Mobile body — не меньше 16 px.
- Заголовки короткие, с отрицательным tracking и без декоративных eyebrow-элементов.

## Геометрия

- Основные круглые controls: 50–58 px.
- Touch target: не меньше 48 px.
- Composer: высота 58–62 px, сильный контур, радиус 30–34 px.
- Основные карточки: радиус 18–28 px.
- Тени только у плавающих controls, drawer-stage и меню.
- Вложенные card-grid без функциональной причины запрещены.

## Desktop

- Desktop остаётся самостоятельным рабочим интерфейсом.
- Sidebar: 252 px.
- Центральный чат: до 820 px.
- Результат открывается отдельным рабочим слоем.
- Редактор сметы: основной лист и summary rail.
- ActionBar сообщения остаётся компактным и не меняет мобильную композицию.

## Mobile web и React Native

- Это отдельная мобильная композиция, а не уменьшенный desktop.
- Слева расположен drawer, открывающийся кнопкой и свайпом от края.
- Постоянная нижняя навигация запрещена.
- Пустой и заполненный чат имеют разные состояния header.
- Composer закреплён снизу с учётом safe area и клавиатуры.
- Ответ содержит timing, разделитель и единый набор message actions.
- Библиотека использует двухколоночную сетку и нижний поиск.
- Проекты используют отдельные экраны и режимы «Чат» / «Работа».
- Desktop-таблица сметы на mobile заменяется карточками, а не масштабируется.

## Контроль единообразия

Release считается допустимым только когда `npm run verify` подтверждает:

- наличие обязательных assistant-ui primitives и adapters;
- отсутствие самописного timing-bypass;
- совпадение ключевых web/native токенов;
- TypeScript, unit, build и browser E2E;
- production acceptance точного SHA.
