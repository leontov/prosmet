# Безопасность, tenancy и права агентов

## 1. Trust boundaries

```text
Untrusted user input
  → Chat/UI validation
  → AG-UI API boundary
  → Domain services
  → PostgreSQL / provider / A2A / deploy adapters
```

Отдельные trust boundaries:

- browser ↔ Next.js API;
- tenant ↔ tenant;
- agent ↔ capability gateway;
- worker ↔ control plane;
- preview ↔ production;
- application ↔ secret manager;
- public HTTPS edge ↔ internal port 3200.

## 2. Identity и tenancy

Каждый server-side объект должен быть привязан к owner/tenant:

- threads;
- messages;
- projects/objects;
- estimates and revisions;
- documents;
- prices and evidence;
- files;
- provider connections;
- agent runs;
- A2A tasks and artifacts;
- approvals and deployments.

Правило: identifier из request не является разрешением. Каждый read/write проверяет принадлежность server-side.

Guest identity допустима только как ограниченный контур. Переход к организации не должен смешивать данные разных владельцев.

## 3. Cookies и HTTPS

Production cookie:

- `HttpOnly`;
- `SameSite=Lax` или более строго по сценарию;
- `Secure` за HTTPS proxy;
- разумный Max-Age;
- rotation/revocation для auth sessions;
- не содержит секретов или чувствительных данных.

`X-Forwarded-Proto` доверяется только от локального/доверенного reverse proxy. Прямой public доступ к internal application port должен быть ограничен firewall.

## 4. Секреты

Запрещено:

- хранить API keys в repository;
- передавать secret в browser;
- возвращать его из `/api/providers`;
- помещать в AG-UI/A2A event;
- печатать в logs или artifacts;
- копировать общий приватный ключ на fleet;
- вставлять secret в prompt.

Разрешено:

- server-side encrypted storage;
- secret reference/handle;
- short-lived token;
- workload identity;
- masked diagnostic metadata (`hasSecret`, lastCheckedAt, provider name).

## 5. Provider security

- explicit provider selection;
- no silent fallback;
- allowlisted base URLs/schemes;
- request timeout and cancellation;
- response size limits;
- secrets only server-side;
- no provider response may directly execute code or SQL;
- structured interpretation passes domain validation;
- provider outage does not блокирует owner service/settings recovery path.

## 6. A2A capability gateway

Каждый вызов инструмента проверяет:

- agent identity;
- owner/tenant;
- task ID;
- repository;
- branch;
- environment;
- capability scope;
- expiry;
- approval ID;
- idempotency key;
- audit correlation ID.

Production write/deploy запрещён через общий shell. Используются узкие adapters с проверяемыми аргументами.

## 7. Owner approval

Требует явного подтверждения:

- merge в `main` при повышенном риске;
- production migration;
- production deploy/rollback;
- изменение auth/permissions;
- доступ к secret reference;
- удаление данных;
- изменение DNS/TLS/firewall;
- расширение agent permissions.

Approval содержит scope, target, exact SHA, expiry и actor. Старое approval нельзя использовать для нового SHA.

## 8. Sandbox и workers

- ephemeral workspace;
- read-only base checkout;
- ограниченный writable layer;
- network egress policy;
- CPU/RAM/time limits;
- process tree cancellation;
- no host Docker socket by default;
- no home-directory secret inheritance;
- artifact export через контролируемый канал;
- cleanup после задачи;
- signed/traceable worker identity.

## 9. Git safety

- branch protection;
- exact base SHA;
- no force push to `main`;
- commits связаны с task/audit ID;
- PR показывает diff и checks;
- merge только проверенного head SHA;
- generated files reviewed;
- binary artifacts не коммитятся без необходимости;
- dependency lockfile обязателен.

## 10. Database safety

- parameterized queries;
- tenant predicate;
- least-privilege DB role;
- migrations backward-compatible;
- destructive migration — отдельный approval и backup/rollback plan;
- statement timeout;
- connection limits;
- audit для mutation высокого риска;
- immutable revisions не обновляются in place.

## 11. Web security headers

Production edge/application должны обеспечивать:

- CSP без `unsafe-eval`;
- `object-src 'none'`;
- `frame-ancestors 'none'`;
- `base-uri 'self'`;
- `form-action 'self'`;
- `X-Content-Type-Options: nosniff`;
- строгую referrer policy;
- HSTS на HTTPS edge;
- Permissions-Policy, скрывающую неиспользуемые capabilities;
- no mixed content.

COOP/CORP включаются только после проверки совместимости и только на trustworthy HTTPS origin.

## 12. Input/output safety

- request size limits;
- schema validation;
- safe filename normalization;
- MIME/type validation;
- no arbitrary path traversal;
- no raw HTML from model without sanitization;
- generated markdown treated as untrusted;
- export data escaped;
- uploaded files scanned/isolated according to policy;
- external price evidence records provenance, not executable content.

## 13. Logging и privacy

Логировать:

- event type;
- actor/task/run/correlation IDs;
- target resource;
- result/status;
- latency;
- provider/model metadata;
- permission/approval metadata;
- release SHA.

Не логировать:

- API keys/tokens;
- полные документы клиента без необходимости;
- персональные данные в свободном тексте;
- private chain of thought;
- database passwords;
- raw auth cookies.

## 14. Threat scenarios, блокирующие release

- cross-tenant read/write;
- secret in client bundle/log/artifact;
- unauthenticated production action;
- agent escalation beyond grant;
- arbitrary command injection;
- SQL injection;
- path traversal/file overwrite;
- unvalidated webhook/action;
- silent provider substitution;
- insecure HTTP production session;
- migration without rollback;
- release SHA mismatch.

## 15. Incident response

1. остановить опасную capability через kill switch;
2. сохранить audit/log evidence;
3. revoke/rotate affected credentials;
4. isolate worker/release;
5. rollback на последний подтверждённый SHA;
6. проверить tenant impact;
7. исправить root cause;
8. добавить regression/security test;
9. выпустить новый exact SHA через полный gate;
10. задокументировать incident без раскрытия секретов.
