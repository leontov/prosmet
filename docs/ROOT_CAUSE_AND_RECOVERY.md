# Prosmet: root cause and recovery contract

## What actually failed

The production address on port 3200 was serving an older statically prerendered Next.js document with a one-year shared cache. That document referenced the removed SQL.js/WASM runtime and permissive CSP. A successful HTTP 200 therefore did not prove that the current React application had hydrated.

The client runtime also contained a feedback loop: every assistant thread update invoked a workspace refresh; the refresh recreated the workspace object, thread-list adapter and AG-UI runtime; the recreated runtime emitted another update. This could consume the browser event loop immediately after hydration and make the tab appear frozen.

The first server database fallback was PGlite and the next experiment used a beta embedded PostgreSQL binary. Neither is accepted as the production authority. The embedded binary produced an ABI-incompatible cluster on Primary.

## Recovery architecture

- Next.js App Router page is dynamic and returned with `Cache-Control: no-store`.
- assistant-ui owns the conversation runtime; no runtime-wide refresh subscription is allowed.
- AG-UI remains the only assistant transport.
- Native IndexedDB stores the local cache and outbox; no SQL.js or browser WASM is shipped.
- A real PostgreSQL server is extracted rootlessly from signed Ubuntu `postgresql-16` packages and runs on loopback.
- PostgreSQL is the server source of truth; `/api/sync` performs idempotent push/pull.
- Chromium must prove that the composer stays responsive, both sidebars render, the estimate tool appears, reload restores state, synchronization reaches PostgreSQL, and obsolete WASM URLs return 404 without a console or page error.

## Release rule

No HTTP health response, source scan, build log or server-side screenshot by itself is a release proof. Promotion to port 3200 requires the complete browser and database gate on `prosmet-primary`.
