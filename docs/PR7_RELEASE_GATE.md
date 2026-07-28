# PR 7 release gate

This branch may be merged only after the trusted `prosmet-primary` gate proves all of the following on the real Primary runner:

- persistent PostgreSQL is running and the masked `DATABASE_URL` connects to database `prosmet` as user `prosmet`;
- source contract, strict TypeScript, unit tests and production build pass;
- desktop and mobile Chromium hydrate the assistant-ui application without browser runtime errors;
- the native `prosmet-cache-v3` IndexedDB cache survives reload;
- an outbox operation is pushed to PostgreSQL and can be pulled back by another device identity;
- `/sql-wasm.wasm` and `/sql-wasm-browser.wasm` return 404 while the UI remains interactive;
- no production dependency or CSP permission for browser SQL/WASM remains.

Status-reporting API calls are informational and must never block the technical gate.
