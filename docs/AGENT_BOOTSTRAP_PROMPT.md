# Bootstrap prompt для разработки Просметчика

Передай этот prompt любому новому Codex/MiMo/A2A/CLI-агенту, работающему с `leontov/prosmet`.

```text
Ты продолжаешь существующий production-проект «Просметчик».

Repository: leontov/prosmet
Production branch: main
Runner: prosmet-primary
Internal app: http://127.0.0.1:3200
Public app: https://kolibriai.online

Не начинай новый bootstrap, не создавай новый репозиторий, не переносись на старые
ветки и не переписывай архитектуру с нуля.

Сначала прочитай в указанном порядке:
1. /AGENTS.md
2. /docs/AGENT_CONTEXT_INDEX.md
3. /docs/PRODUCT_SPEC_AND_ROADMAP.md
4. /docs/UX_PREMIUM_FOUNDATION_V1.md
5. /docs/A2A_DEVELOPER_MODE.md
6. /docs/AGENT_ENGINEERING_PLAYBOOK.md
7. /README.md
8. package.json, source contracts, production workflow и релевантные tests

Текущий обязательный scope — PROSMET UX PREMIUM FOUNDATION V1. Новые большие
продуктовые модули не добавлять.

Архитектурные инварианты:
- assistant-ui — единственный chat runtime;
- AG-UI — единственный streaming transport;
- PostgreSQL — server source of truth;
- IndexedDB — browser cache/offline outbox;
- browser SQLite/SQL.js/PGlite/WASM/eval запрещены;
- технологическая карта формируется до сметы;
- итог сметы рассчитывается детерминированно;
- secrets не попадают в client/messages/artifacts/logs;
- compact estimate card — основной результат в чате;
- desktop/mobile используют одну доменную модель и adaptive composition.

Не составляй новый общий план, если production gate уже красный. Выполни:
1. Получи exact main SHA.
2. Найди последний Prosmet Main Production run.
3. Открой jobs и лог первого failed step.
4. Сформулируй один доказанный blocker.
5. Исправь минимальный root cause.
6. Добавь regression test/source contract.
7. Продолжай по новым логам, пока весь gate не станет зелёным.

Нельзя завершать работу коммитом, PR, локальной сборкой, внутренним деплоем,
скриншотом или отчётом об оставшихся ошибках.

Definition of Done:
- source contracts PASS;
- strict typecheck PASS;
- unit PASS;
- production build PASS;
- desktop Chromium PASS;
- mobile Chromium PASS;
- immutable deploy to 3200 PASS;
- exact public SHA on https://kolibriai.online PASS;
- HTTP→HTTPS, HSTS, CSP PASS;
- live desktop/mobile smoke PASS;
- evidence artifact создан;
- опубликован MAIN PRODUCTION PASS.

При failure не останавливайся: прочитай новый лог, исправь следующий blocker и
повтори release loop. Внешний blocker допустим только с машинным доказательством
и точным действием, которое невозможно выполнить из репозитория или доступных
adapters.
```

## Контроль ответа агента

Хороший финальный ответ имеет вид:

```text
MAIN PRODUCTION PASS
Commit: <exact sha>
Run: <workflow run id>
App: https://kolibriai.online/
Health exact SHA: PASS
Desktop live: PASS
Mobile live: PASS
Evidence: <artifact>
```

Любой ответ со словами «осталось», «пока не готово», «нужно запустить» означает, что агент должен продолжить работу, если blocker находится в доступном ему контуре.