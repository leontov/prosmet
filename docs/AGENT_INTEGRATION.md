# Интеграция агентов

Просметчик не привязан к одной модели. Web, iOS и Android обращаются к единому серверному маршруту `POST /api/agent`, а сервер выбирает и вызывает настроенный adapter.

## Поддерживаемые адаптеры

| Тип | Транспорт | Назначение |
| --- | --- | --- |
| `openai-compatible` | HTTP `POST /chat/completions` | OpenAI API, vLLM, LM Studio и совместимые серверы |
| `ollama` | HTTP `POST /api/chat` | локальный или удалённый Ollama |
| `codex-app-server` | JSON-RPC/JSONL через stdio | установленный `codex app-server` |
| `ag-ui` | HTTP Prosmet envelope | удалённый AG-UI gateway |
| `a2a` | HTTP Prosmet envelope | A2A coordinator или отдельный агент |

Все адаптеры возвращают один нормализованный результат:

```ts
{
  text: string;
  artifact?: "estimate";
  estimate?: Estimate;
  provider?: AgentSummary;
  latencyMs?: number;
}
```

Смета проходит серверную проверку структуры и не создаётся из фиктивных fallback-данных. Если агент или его credentials недоступны, пользователь видит реальную ошибку подключения, а не подставной результат.

## Безопасность

- API keys не отправляются в браузер и мобильное приложение.
- Секрет, введённый через кабинет супер-администратора, шифруется AES-256-GCM.
- Ключ шифрования хранится в `PROSMET_AGENT_CONFIG_KEY`.
- Административные endpoints защищены bearer-токеном `PROSMET_ADMIN_TOKEN`.
- Токен, вводимый в UI, живёт только в React state текущей вкладки и не записывается в `localStorage`.
- Публичный `GET /api/agents` возвращает только безопасные метаданные.
- Codex запускается в режиме `approvalPolicy: never` и `readOnly`; запросы на повышение прав отклоняются.

Production deployment создаёт постоянный файл:

```text
~/.prosmet-greenfield/agent-admin.env
```

с правами `0600`, если он отсутствует. Конфигурация подключений хранится отдельно:

```text
~/.prosmet-greenfield/agents.json
```

## Подключение через интерфейс

1. Открыть `Настройки → Интеграция агентов`.
2. Ввести server-side super-admin token.
3. Нажать `Подключить агента`.
4. Выбрать adapter, указать endpoint/model и способ получения API key.
5. Сохранить.
6. Выполнить `Проверить`.
7. Назначить подключение основным.

На desktop активного агента можно переключать в верхней панели. Мобильное приложение использует основной server-side agent и не хранит credentials.

## Переменные окружения

### Общие

```bash
PROSMET_ADMIN_TOKEN=<long-random-token>
PROSMET_AGENT_CONFIG_KEY=<long-random-encryption-key>
PROSMET_AGENT_CONFIG_FILE=$HOME/.prosmet-greenfield/agents.json
PROSMET_DEFAULT_AGENT_ID=<agent-id>
```

### Несколько провайдеров одним JSON

```bash
PROSMET_AGENT_PROVIDERS_JSON='[
  {
    "id": "primary",
    "name": "Primary model",
    "kind": "openai-compatible",
    "baseUrl": "https://provider.example/v1",
    "model": "model-name",
    "apiKeyEnv": "PRIMARY_AGENT_API_KEY",
    "enabled": true,
    "supportsTools": true
  }
]'
```

### OpenAI-compatible

```bash
PROSMET_OPENAI_COMPATIBLE_BASE_URL=https://provider.example/v1
PROSMET_OPENAI_COMPATIBLE_MODEL=model-name
PROSMET_OPENAI_COMPATIBLE_KEY_ENV=OPENAI_API_KEY
OPENAI_API_KEY=...
```

### Ollama

```bash
PROSMET_OLLAMA_BASE_URL=http://127.0.0.1:11434
PROSMET_OLLAMA_MODEL=llama3.3
PROSMET_OLLAMA_TOOLS=1
```

### Codex App Server

```bash
PROSMET_CODEX_ENABLED=1
PROSMET_CODEX_MODEL=<optional-model>
PROSMET_CODEX_CWD=$HOME/.prosmet-greenfield/workspaces
PROSMET_CODEX_TIMEOUT_MS=180000
```

При production-деплое Codex включается автоматически, если бинарник `codex` доступен пользователю runner. Авторизация Codex должна быть настроена на сервере отдельно.

### AG-UI и A2A

```bash
PROSMET_AGUI_URL=https://agent.example
PROSMET_AGUI_ENDPOINT=/run
PROSMET_AGUI_KEY_ENV=AGUI_API_KEY

PROSMET_A2A_URL=https://coordinator.example
PROSMET_A2A_ENDPOINT=/tasks/send
PROSMET_A2A_KEY_ENV=A2A_API_KEY
```

Удалённый endpoint получает сообщения, описание `prosmet_create_estimate` и JSON Schema результата. Он должен вернуть Prosmet envelope либо OpenAI-compatible message/tool-call response.

## API

Публичные:

```text
GET  /api/health
GET  /api/identity
GET  /api/agents
POST /api/agent
```

Super-admin:

```text
GET    /api/admin/agents
POST   /api/admin/agents
PUT    /api/admin/agents/:id
DELETE /api/admin/agents/:id
POST   /api/admin/agents/:id/activate
POST   /api/admin/agents/:id/test
```

## Проверки релиза

Локальный Playwright запускает отдельный OpenAI-compatible fixture, но проходит через тот же production router, adapter, function tool и schema validation. Поэтому browser acceptance не использует встроенную демонстрационную смету.

Production acceptance дополнительно проверяет:

- immutable server modules присутствуют в release directory;
- `/api/agents` доступен локально и публично;
- процесс переживает GitHub Runner cleanup;
- внешний GitHub-hosted runner видит DNS, HTTPS, точный SHA и agent registry;
- desktop/mobile Chromium проходят живой HTTPS-сценарий.
