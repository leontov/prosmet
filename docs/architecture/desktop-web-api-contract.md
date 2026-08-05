# ProSmet desktop web API contract

## Canonical contract

- Source: `scripts/openapi-source.mjs`.
- Committed generated document: `apps/web/public/openapi.json`.
- Production endpoint: `GET /api/openapi.json`.
- Validation: `node scripts/openapi-contract.mjs`.
- Regeneration: `node scripts/openapi-contract.mjs --write`.

The generated JSON is committed so CI can detect accidental drift. The server exposes the same file copied by Vite into the immutable web artifact; production does not generate a different specification at runtime.

## Route scopes

Every operation has `x-prosmet-scope`:

- `public`: no administrative credential is required. This describes the current backward-compatible contract, not completed tenant isolation.
- `user`: requires the signed `prosmet_user_session` HttpOnly cookie.
- `admin`: requires the signed `prosmet_admin_session` cookie or `x-prosmet-admin-token`. Provider secrets are never returned.

The current estimates, projects and workflow routes still use the legacy owner `production`. User-to-user isolation, CSRF protection and revision preconditions are a separate migration tracked by issue #77. Clients must not infer tenant isolation from a public scope.

## Compatibility policy

Existing unversioned paths remain backward compatible. A breaking request or response change requires one of:

1. a versioned path;
2. a documented compatibility window and dual-read/dual-write migration;
3. a formally approved exception with contract tests and release notes.

Removing a path, changing an operation scope, changing required fields, narrowing an enum or replacing the standard error envelope is a breaking change.

## Standard error envelope

```json
{
  "error": {
    "code": "ESTIMATE_NOT_FOUND",
    "message": "Смета не найдена.",
    "details": null
  }
}
```

Operations document 400, 401, 403, 404, 409, 429 and 500 responses. Rate-limited responses expose `Retry-After` where available.

## Contract gate

`scripts/openapi-contract.mjs` checks:

- OpenAPI version 3.1;
- route inventory and operation count;
- route implementation markers in `apps/web/server.mjs`;
- unique operation IDs;
- public/user/admin scope parity;
- standard error responses;
- absence of provider secret fields in public schemas;
- canonical generated JSON;
- literal `/api/**` routes that have not been documented.

The Playwright smoke test also reads `/api/openapi.json` through the running server and checks critical auth and agent boundaries.
