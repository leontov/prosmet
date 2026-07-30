# Восстановление write-actions

Этот runbook применяется, когда агент может читать GitHub, но не может создавать ветки, коммиты, PR, issue comments, workflow dispatch или merge.

## 1. Не путать разные права

Проверить отдельно:

- GitHub connector write permission;
- repository permission (`push`/`maintain`/`admin`);
- branch protection;
- Actions `GITHUB_TOKEN` permissions;
- self-hosted runner online state;
- owner approval/capability grant внутри Просметчика;
- GitHub App installation scope;
- organization policy/SSO.

Read-доступ не доказывает write-доступ.

## 2. Connector / GitHub App

В настройках подключения GitHub:

1. открыть permissions установленного приложения;
2. разрешить необходимые repository actions;
3. убедиться, что `leontov/prosmet` входит в selected repositories;
4. повторно авторизовать соединение после изменения scope;
5. при organization SSO подтвердить доступ;
6. проверить, что токен/installation не истёк и приложение не удалено.

Минимально для обычной разработки:

- Contents: read/write;
- Pull requests: read/write;
- Issues: read/write;
- Actions: read;
- Workflows: write только если агент должен менять/dispatch workflows;
- Metadata: read.

Не выдавать Admin без реальной необходимости.

## 3. Repository permission

Для пользователя/installation проверить:

```text
pull: true
push: true
maintain/admin: по необходимости
```

Если repo private/organization-owned, проверить team membership и base role.

## 4. Branch protection

Write может быть разрешён, а прямой push в `main` запрещён. Это нормальная защита.

Корректный путь:

```text
create branch
→ commit
→ PR
→ required checks
→ approved merge
```

Проверить:

- required status checks;
- required reviews;
- signed commits;
- linear history;
- restrictions on who can push;
- rulesets для branch/tag;
- bypass list.

Не отключать protection ради агента. Добавлять только необходимый GitHub App/user в допустимый workflow.

## 5. GitHub Actions token

В workflow явно задать минимальные permissions.

Пример для release status comment:

```yaml
permissions:
  contents: read
  issues: write
```

Для workflow, который создаёт commit/PR, понадобятся отдельные обоснованные права:

```yaml
permissions:
  contents: write
  pull-requests: write
```

`GITHUB_TOKEN` не должен автоматически иметь broad write. Проверить organization/repository setting:

```text
Settings → Actions → General → Workflow permissions
```

Если PR из fork, secrets/write permissions по умолчанию ограничены. Не включать небезопасный `pull_request_target` для выполнения untrusted code.

## 6. Workflow dispatch

Чтобы агент мог запускать workflow:

- workflow содержит `workflow_dispatch`;
- соединение имеет Actions/workflow permission;
- ref существует;
- workflow file находится в default branch;
- input соответствует schema;
- organization policy разрешает action.

## 7. Self-hosted runner

Write-actions могут быть восстановлены, но release всё равно не запустится, если `prosmet-primary` offline/busy/mislabeled.

Проверить:

- runner online;
- label `self-hosted`, `Linux`, `X64`;
- runner service/process;
- network to GitHub;
- disk space;
- workspace ownership;
- no stale lock;
- exact runner name contract.

## 8. Внутренний capability grant Просметчика

A2A agent получает только выданный scope:

```text
write-sandbox
write-branch
open-pr
merge-main
deploy-preview
deploy-production
```

Если GitHub connector имеет write, но A2A capability не выдана, задача должна быть `awaiting-owner-approval`, а не обходить gateway.

Approval привязан к task, repository, branch/environment, exact SHA и expiry.

## 9. Диагностическая последовательность

1. `get_repo` — проверить permissions.
2. Создать временную branch от current `main`.
3. Создать безопасный docs-only commit.
4. Создать PR.
5. Проверить mergeability и branch rules.
6. Закрыть/merge тестовый PR по политике.
7. Проверить issue comment write.
8. Проверить Actions read/dispatch отдельно.
9. Удалить временные ветки/артефакты.

Не проверять write путём опасного изменения production workflow или секретов.

## 10. Типовые ошибки

### `Resource not accessible by integration`

Причины:

- GitHub App не установлено на repo;
- permission scope read-only;
- workflow token не имеет нужного permission;
- organization policy;
- fork context.

### `403 Must have admin rights`

Запрошено действие, требующее admin. Использовать более узкий путь или owner approval.

### `422 sha wasn't supplied`

Попытка создать существующий файл через create API. Сначала fetch current file SHA, затем update.

### `protected branch hook declined`

Использовать branch + PR; не force push.

### PR `mergeable: false`

Проверить conflicts, stale base, required checks и ruleset. Обновить branch от current main, не создавать параллельные дубликаты.

## 11. Критерий восстановления

Write-actions восстановлены только после фактического доказательства:

- branch создана;
- commit записан;
- PR создан/обновлён;
- issue comment опубликован при необходимости;
- required workflow запускается;
- permitted merge/deploy выполняется через approval;
- audit содержит actor/task/action/result.

Чтение repo или успешный локальный patch не считается восстановлением write-actions.
