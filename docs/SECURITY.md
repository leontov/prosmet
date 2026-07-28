# Security

Implemented in this slice:

- strict Zod/request validation and body-size limits;
- CSP, COOP/COEP, `nosniff`, private file caching and HttpOnly guest-device cookie;
- owner-scoped local file storage using generated UUID paths only;
- extension/MIME pair allowlist, SHA-256 evidence and 20 MiB limit;
- no secret in browser state, localStorage, AG-UI events or repository;
- user cancellation without false success/error;
- safe errors, non-root container and immutable image labels;
- tenant-keyed PostgreSQL schema and security eval cases.

Open production gates: Better Auth sessions and migration from guest device ownership, CSRF token validation for authenticated mutations, distributed rate limiting, encrypted provider credential vault, PostgreSQL row-level authorization tests, S3 adapter and sandboxed unattended MiMo runner.
