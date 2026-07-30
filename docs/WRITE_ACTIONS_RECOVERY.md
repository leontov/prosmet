# Восстановление write-actions для агентной разработки

Этот runbook применяется, когда агент может читать `leontov/prosmet`, но не может создать/изменить файл, branch, pull request, merge, workflow dispatch или получить Actions logs.

Write-actions и `GITHUB_TOKEN` workflow — разные контуры. Сначала определить, какой именно доступ сломан.

## 1. Матрица требуемых возможностей

| Операция | Минимальная способность |
|---|---|
| Читать код/issue/PR | repository read |
| Создавать и менять обычные файлы | Contents: write |
| Менять `.github/workflows/*` | Workflows: write или эквивалентное разрешение GitHub App |
| Создавать branch/ref | Contents: write / Git refs write |
| Создавать и обновлять PR | Pull requests: write |
| Комментировать release status | Issues: write |
| Читать jobs/logs/artifacts | Actions: read |
| Перезапускать job/workflow | Actions: write |
| Merge PR | Pull requests: write + branch/ruleset allowance |
| Менять repository/Actions policy | Administration: write |

Для текущего проекта безопасный рабочий минимум агентного connector:

```text
Repository access: leontov/prosmet
Contents: read/write
Pull requests: read/write
Issues: read/write
Actions: read
Metadata: read
Workflows: write — только если агент должен изменять workflow files
Administration: read — только для диагностики policy
```

Actions write, Administration write и merge bypass не выдаются по умолчанию.

## 2. Быстрая диагностика

### 2.1. Read работает, write tool отсутствует

Причина обычно в разрешениях подключённого GitHub App/connector, а не в коде проекта.

Проверить:

1. GitHub connector подключён к тому же аккаунту, который имеет доступ к `leontov/prosmet`.
2. Installation repository access включает именно `leontov/prosmet`, а не только выбранный ранее набор репозиториев.
3. После изменения permissions connector переподключён или installation обновлена.
4. В текущем чате действительно доступны write actions: create/update file, branch/PR/merge или требуемый эквивалент.

### 2.2. HTTP 401

Токен/installation отсутствует, истёк или отозван.

Действие:

- переподключить GitHub integration;
- проверить, что авторизация завершена владельцем нужного аккаунта;
- при SSO подтвердить authorization для организации;
- не вставлять токен в чат или repository file.

### 2.3. HTTP 403

Авторизация существует, но операция запрещена.

Проверить:

- repository permission `Contents: write`;
- `Pull requests: write` для PR/merge;
- `Actions: read/write` для logs/rerun;
- `Workflows: write` при изменении workflow YAML;
- branch protection/ruleset;
- organization/enterprise policy;
- SSO authorization;
- blocked GitHub App installation.

### 2.4. HTTP 404 при существующем репозитории

GitHub часто скрывает недоступный private resource как 404. Для публичного `leontov/prosmet` 404 обычно означает:

- connector installation не видит нужный endpoint;
- неверный owner/repository/path/ref;
- файл отсутствует на выбранной ветке;
- PR/issue принадлежит другому repository;
- branch удалён или не создан.

Сначала выполнить `get repository`, затем `fetch file` на default branch.

### 2.5. HTTP 409

Обычно stale blob SHA или параллельное изменение файла.

Правильный цикл:

```text
fetch current file
→ взять новый content SHA
→ повторно применить полное изменение
→ update file с актуальным SHA
```

Не повторять write со старым SHA и не перетирать чужое изменение.

### 2.6. HTTP 422

Обычно неверный payload, отсутствующий SHA при update, уже существующий path при create или запрещённая ref/branch operation.

Проверить контракт конкретной write action и не использовать create для существующего файла.

## 3. Настройки GitHub Actions

Repository Settings → Actions → General:

- GitHub Actions должны быть enabled;
- используемые actions должны быть разрешены policy;
- `GITHUB_TOKEN` permissions выбираются по принципу least privilege;
- разрешение workflows создавать/approve PR включается только если это действительно часть утверждённого процесса;
- organization/enterprise policy может переопределять repository setting.

Workflow permissions задаются также явно в YAML:

```yaml
permissions:
  contents: read
  issues: write
```

Если указано хотя бы одно permission, неуказанные permissions могут стать `none`. Добавлять write scope только тому job, которому он нужен.

Текущий production workflow не должен получать лишний `contents: write`, если он только checkout/build/deploy и публикует status в issue.

## 4. Branch protection и rulesets

Даже connector с `Contents: write` может не иметь права записать в `main`, если ruleset требует PR, checks или ограничивает push actors.

Проверить:

- требуется ли pull request;
- required status checks;
- required reviews;
- restrict who can push;
- applies to administrators;
- allowed bypass actors/apps;
- merge queue;
- signed commits.

Policy Просметчика:

- `main` — production source of truth;
- force-push запрещён;
- deploy feature branch запрещён;
- небольшой owner-approved gate fix может идти прямо в `main`, только если ruleset допускает;
- крупное/рискованное изменение идёт короткой branch/PR;
- зелёные checks не заменяют post-merge production workflow.

## 5. Проверка после восстановления

Выполнять от минимального риска к большему:

1. `get repository` — подтверждает read и default branch.
2. `fetch AGENTS.md` — подтверждает contents read.
3. Создать короткоживущую task branch, если branch action доступна.
4. Создать или изменить безопасный docs-файл.
5. Прочитать файл повторно и проверить SHA/content.
6. Создать PR, если PR action входит в требуемый контур.
7. Проверить branch rules/checks.
8. Merge только после approval/policy.
9. Прочитать новый production run jobs/logs.
10. Проверить `MAIN PRODUCTION PASS` и exact live SHA.

Временный write probe должен быть удалён тем же change set. Не оставлять мусорные файлы и тестовые branches.

## 6. Если доступно только Contents write

Агент может создавать/обновлять файлы, но не должен утверждать, что ему доступны:

- branch/PR management;
- merge;
- workflow rerun;
- repository settings;
- secrets;
- server shell.

Использовать только реально доступные actions. Недоступная capability отражается как blocker, а не симулируется.

## 7. Server permissions — отдельный контур

GitHub write-actions не дают:

- `sudo` на `prosmet-primary`;
- доступ к DNS registrar;
- firewall control;
- GitHub secrets values;
- provider API keys;
- SSH private keys.

Например, failure `Passwordless sudo is required` не исправляется расширением GitHub Contents permissions. Для него нужен другой runtime strategy или одноразовое системное действие владельца.

## 8. Безопасное одноразовое восстановление host capability

Если production edge должен слушать 80/443, preferred варианты по порядку:

1. уже установленный root-owned reverse proxy с безопасным deploy adapter;
2. capability `cap_net_bind_service` на проверенном edge binary;
3. systemd service/socket, установленный владельцем;
4. rootless container/runtime с реально доступным low-port forwarding;
5. passwordless sudo только для узкого allowlisted deploy script, а не для произвольного shell.

Нельзя выдавать runner безусловный `NOPASSWD: ALL`.

## 9. Что сообщить владельцу при настоящем внешнем blocker

```text
Контур: GitHub connector / Actions token / branch rules / server capability
Ожидалось: <операция>
Фактически: <HTTP/status/error>
Машинное доказательство: <run/job/log/probe>
Нужно одно действие: <точная настройка>
После действия: <какой gate продолжится автоматически>
```

Фраза «нет доступа» без конкретного endpoint, permission и error недостаточна.

## 10. Критерий восстановления

Write-actions считаются восстановленными не после появления кнопки, а после реального контролируемого цикла:

```text
read current SHA
→ write approved change
→ verify resulting SHA
→ production workflow starts
→ jobs/logs readable
→ exact-SHA release reaches MAIN PRODUCTION PASS
```
