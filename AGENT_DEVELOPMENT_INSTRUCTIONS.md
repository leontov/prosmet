# Инструкции агентной разработки Просметчика

Это корневая точка входа для ИИ-команды проекта.

Полный индекс: [`docs/agents/README.md`](docs/agents/README.md).

Машинный manifest: [`docs/agents/INSTRUCTION_MANIFEST.json`](docs/agents/INSTRUCTION_MANIFEST.json).

Готовый bootstrap prompt: [`docs/agents/AGENT_BOOTSTRAP_PROMPT.md`](docs/agents/AGENT_BOOTSTRAP_PROMPT.md).

## Обязательный порядок

1. Прочитать `AGENTS.md` и `.github/copilot-instructions.md`.
2. Прочитать весь набор `docs/agents/` в порядке manifest.
3. Установить current `main`, live SHA и последний production gate.
4. Работать от наблюдаемого пользовательского результата.
5. Соблюдать архитектурные, UX, security и data boundaries.
6. Передать результат независимому verifier.
7. После merge продолжать до green exact-SHA gate.

## Условие завершения

```text
Prosmet Main Production: PASS
main SHA == https://kolibriai.online/api/health.releaseSha
desktop HTTPS smoke: PASS
mobile HTTPS smoke: PASS
```

Коммит, PR, build или внутренний deploy без публичной exact-SHA проверки не являются завершённой работой.
