# Просметчик — агентный контракт

## assistant-ui

Этот проект использует `assistant-ui` как единственный runtime интерфейса чата.

Перед любыми изменениями assistant-ui необходимо открыть актуальный индекс документации:

- https://www.assistant-ui.com/llms.txt
- https://www.assistant-ui.com/llms-full.txt

Официальные навыки устанавливаются в проект для Codex командой:

```bash
npx skills add assistant-ui/skills --skill '*' --agent codex --copy --yes
```

После установки использовать соответствующие навыки: `assistant-ui`, `setup`, `primitives`, `runtime`, `tools`, `streaming`, `cloud`, `thread-list`, `update`, `copilots`, `markdown`, `react-mcp`, `observability`.

## Обязательные правила реализации

- Не создавать второй самодельный chat runtime параллельно с assistant-ui.
- `AssistantRuntimeProvider` монтируется один раз у корня приложения.
- `AG-UI` — единственный потоковый транспорт между frontend и agent backend.
- Сообщения, composer, ветки, вложения, tool UI и thread list реализуются через официальные primitives/adapters.
- Новые tool UI регистрируются через toolkit API и отображаются внутри сообщения.
- Для reasoning/tool grouping использовать актуальный `MessagePrimitive.GroupedParts`, а не устаревшие component props.
- Визуальный контракт: интерфейс в стиле ChatGPT/Codex, один sidebar, центральный чат, интерактивные сметы и документы без отдельного перегруженного ERP-интерфейса.
- Любое изменение завершается реальным Chromium desktop/mobile тестом и контрольным скриншотом.
