# Agent Task Template — Просметчик

Используй этот шаблон для каждой A2A/development-задачи. Поля должны быть заполнены до code/test/git/deploy.

```yaml
task:
  id: <stable task id>
  title: <короткий наблюдаемый результат>
  owner: product_owner
  repository: leontov/prosmet
  base_branch: main
  base_sha: <exact sha>
  environment: production|preview|test
  permission_requested: read|propose|code|test|git|deploy

intent:
  user_pain: <какую боль пользователя закрывает изменение>
  goal: <что пользователь увидит или получит>
  non_goals:
    - <что специально не делаем>

current_evidence:
  workflow_run_id: <id|null>
  failed_job_id: <id|null>
  failed_step: <name|null>
  error_excerpt: <точный текст>
  live_url: https://kolibriai.online/
  live_release_sha: <sha|null>

scope:
  allowed_paths:
    - <path/glob>
  forbidden_changes:
    - new product modules outside active release
    - bypassing tests or deployment workflow
    - weakening tenancy, security or CSP
    - storing secrets in repository/browser/artifacts

acceptance:
  functional:
    - <observable behavior>
  architecture:
    - assistant-ui remains the only chat runtime
    - AG-UI remains the only streaming transport
    - PostgreSQL remains server authority
    - IndexedDB remains browser cache/outbox
  quality:
    - source contracts pass
    - strict typecheck passes
    - unit tests pass
    - production build passes
    - desktop Chromium passes
    - mobile Chromium passes
  release:
    - immutable deploy on prosmet-primary:3200
    - public HTTPS exact SHA
    - HTTP redirect and HSTS
    - live desktop/mobile smoke
    - MAIN PRODUCTION PASS

plan:
  blocker: <one verified blocker>
  change: <minimal fix>
  regression_guard: <test/contract>
  rollback: <how to revert safely>

artifacts:
  required:
    - source-contract.log
    - typecheck.log
    - unit-tests.log
    - build.log
    - e2e-predeploy.log
    - deploy.log
    - public-health.json
    - public-headers.txt
    - e2e-live-https.log
    - desktop screenshot
    - mobile screenshot
    - release/summary.json

completion:
  commit_sha: <exact sha>
  workflow_run_id: <id>
  release_sha_matches: true|false
  main_production_pass: true|false
  unresolved_p0_p1: []
```

## Правила заполнения

1. `goal` описывает результат, а не активность агента.
2. `base_sha` обязателен до изменения файлов.
3. `error_excerpt` копируется из фактического лога.
4. `permission_requested` минимально необходимое.
5. `forbidden_changes` не удаляются ради удобства.
6. `regression_guard` обязателен для исправления defect/gate.
7. `main_production_pass: false` означает, что задача не завершена.
8. При новом failure обновляется `current_evidence`, а задача возвращается в работу.

## Пример

```yaml
task:
  id: PROSMET-HTTPS-001
  title: Public HTTPS exact-SHA release on kolibriai.online
  owner: product_owner
  repository: leontov/prosmet
  base_branch: main
  base_sha: 5c2be3e22be2cafdab0ca5fbdb54bf0c5115afbe
  environment: production
  permission_requested: deploy

intent:
  user_pain: browser security features and trust fail on raw HTTP IP
  goal: kolibriai.online serves the exact main SHA over valid HTTPS
  non_goals:
    - add new product modules

current_evidence:
  workflow_run_id: 30540273435
  failed_step: Provision HTTPS for kolibriai.online
  error_excerpt: Passwordless sudo is required to install the HTTPS edge binary and bind ports 80/443
  live_url: https://kolibriai.online/

plan:
  blocker: edge installer assumes sudo although runner capability differs
  change: select capability/rootless/Docker runtime from observed environment
  regression_guard: HTTPS source contract and live TLS gate
  rollback: revert deployment/provision-https.sh and retain previous healthy app release

completion:
  main_production_pass: false
```

Задача остаётся активной, пока последний блок не станет:

```yaml
completion:
  release_sha_matches: true
  main_production_pass: true
  unresolved_p0_p1: []
```