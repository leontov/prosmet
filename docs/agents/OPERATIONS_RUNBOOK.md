# Operations runbook: Primary, PostgreSQL, HTTPS и rollback

## 1. Каноническая production-топология

```text
Internet
  → DNS kolibriai.online
  → Caddy :80/:443
  → 127.0.0.1:3200 Prosmet exact-SHA release
  → PostgreSQL 127.0.0.1:55432 (или явно настроенный external DATABASE_URL)
```

Production runner: `prosmet-primary`.

Приложение и тяжёлые проверки выполняются на Primary/кластере, не на Mac владельца.

## 2. Быстрая диагностика

Проверять в таком порядке:

1. `main` SHA;
2. последний GitHub Actions run;
3. первый failed step;
4. состояние runner;
5. internal port 3200;
6. PostgreSQL probe;
7. Caddy/ports 80/443;
8. DNS;
9. certificate/HTTPS;
10. public exact SHA;
11. browser console/network.

Нельзя начинать с перезапуска всего сервера без локализации причины.

## 3. GitHub Actions

Workflow: `.github/workflows/launch-3200.yml` (`Prosmet Main Production`).

Проверить:

- run запущен для текущего `main` SHA;
- runner name равен `prosmet-primary`;
- предыдущий run не считается доказательством;
- concurrency отменяет устаревший candidate;
- artifact uploaded даже при failure;
- issue status comment соответствует final job status.

При failure открыть jobs → failed step → full logs → Playwright trace/screenshots.

## 4. Internal application

Ожидается:

```text
http://127.0.0.1:3200/api/health
http://127.0.0.1:3200/api/backend/status
http://127.0.0.1:3200/api/workspace
http://127.0.0.1:3200/api/providers
```

Проверить:

- process жив;
- listener принадлежит Prosmet release directory;
- health содержит expected exact SHA;
- backend сообщает PostgreSQL connected;
- browser cache contract = IndexedDB;
- WASM = false;
- AG-UI probe содержит `RUN_STARTED`, content и `RUN_FINISHED`.

Чужой процесс на 3200 не убивается автоматически. Сначала установить его cwd/owner.

## 5. Immutable releases

Release directory:

```text
$HOME/.prosmet/releases/<exact-sha>
```

Release создаётся из чистого standalone build. Текущий process запускается из exact directory. Хранятся несколько последних релизов для rollback.

Release metadata:

```text
$HOME/.prosmet/release.json
$HOME/.prosmet/prosmet.pid
$HOME/.prosmet/prosmet.log
```

Нельзя считать deployment корректным, если process запущен из mutable working tree.

## 6. PostgreSQL

Файлы:

```text
$HOME/.prosmet/database.env
$HOME/.prosmet/postgres-status.json
$HOME/.prosmet/postgres-migration.json
```

Проверить:

- `DATABASE_URL` начинается с `postgresql://`;
- database/user ожидаемые;
- probe выполняет простой query;
- migration закончилась успешно;
- app использует тот же URL;
- порт БД не открыт публично без необходимости;
- данные persistent между application releases.

При migration failure новый process не должен заменять текущий healthy release.

## 7. DNS

Для apex:

```text
kolibriai.online A 78.17.4.108
```

Опционально:

```text
www CNAME kolibriai.online
```

Удалить конфликтующие A/AAAA записи, если они ведут на другой host. Учитывать TTL и authoritative nameservers.

Если workflow ждёт DNS:

- проверить A через несколько resolvers;
- проверить AAAA;
- сравнить authoritative ответ;
- не выпускать сертификат до корректного публичного разрешения.

## 8. Caddy / HTTPS

Provision script: `deployment/provision-https.sh`.

Ожидается:

- Caddy установлен в owner-controlled runtime;
- разрешено bind к 80/443 безопасным способом;
- конфигурация валидна;
- reverse proxy ведёт на `127.0.0.1:3200`;
- `X-Forwarded-Proto https` передаётся приложению;
- HTTP перенаправляется на HTTPS;
- certificate валиден;
- HSTS присутствует;
- Caddy process переживает окончание workflow runner job.

Файлы состояния должны храниться вне ephemeral Actions workspace.

## 9. Public HTTPS probe

Проверить:

```text
https://kolibriai.online/
https://kolibriai.online/api/health
https://kolibriai.online/api/backend/status
```

Acceptance:

- HTTP status успешный;
- certificate hostname/chain/time валидны;
- redirect с `http://kolibriai.online`;
- HSTS;
- CSP без unsafe-eval/wasm-eval;
- no mixed content;
- health SHA == workflow SHA;
- backend PostgreSQL connected;
- secure cookie содержит Secure;
- desktop/mobile live smoke зелёный.

## 10. Browser defects

### `Speech adapter not configured` / `Feedback adapter not configured`

Причина: UI показал capability без adapter.

Исправление:

- скрыть control на уровне capability/state;
- не подавлять exception общим handler;
- добавить E2E, нажимающий все видимые controls;
- console gate должен оставаться строгим.

### COOP ignored / untrustworthy origin

- production должен быть HTTPS;
- не навязывать COOP на raw HTTP compatibility endpoint;
- после HTTPS проверять header только если реально нужен;
- blob URL наследует origin, поэтому экспорт проверять на public HTTPS.

### WASM/SQLite 404/compile

- browser SQL/WASM запрещён;
- удалить зависимости/assets/imports;
- проверить obsolete paths возвращают 404 без runtime errors;
- IndexedDB остаётся browser cache.

### Mobile click intercepted / outside viewport

- проверить stacking context и fixed dialog containment;
- scrollable content и sticky footer должны быть внутри dialog;
- не лечить постоянным `force: true`;
- E2E проверяет реальный click и viewport geometry.

## 11. Rollback

Rollback нужен, если:

- health failed;
- exact SHA mismatch;
- data corruption risk;
- critical E2E regression;
- severe security defect;
- HTTPS недоступен после ранее рабочего release.

Процедура:

1. выбрать последний `MAIN PRODUCTION PASS` SHA;
2. проверить совместимость БД;
3. остановить только текущий Prosmet process;
4. запустить previous immutable release;
5. проверить internal health/backend;
6. проверить public HTTPS;
7. зафиксировать rollback metadata/audit;
8. открыть root-cause task;
9. не удалять failed evidence.

Если новая migration необратима, rollback plan должен быть подготовлен до deploy.

## 12. Evidence после восстановления

Сохранить:

- failed run/log;
- root cause;
- fix commit;
- regression test;
- successful run;
- public health SHA;
- desktop/mobile screenshots;
- rollback target;
- время инцидента и восстановления.

## 13. Статус владельцу

Корректно:

> Gate красный на mobile Chromium: dialog footer перекрывался chat layer. Исправлен stacking/containment, добавлен regression test. Новый run для SHA … выполняется.

Некорректно:

> Всё почти готово, осталось дождаться деплоя.

После PASS:

> `main` и production совпадают по SHA …; workflow … PASS; HTTPS health, PostgreSQL и live desktop/mobile smoke подтверждены.
