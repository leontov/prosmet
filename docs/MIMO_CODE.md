# MiMo Code provider

MiMo credentials are server-only environment values. `createMiMoProvider()` refuses to start when `MIMO_API_BASE_URL`, `MIMO_API_KEY` or `MIMO_MODEL` is absent. There is no browser CLI invocation, no `auth.json`, no localStorage secret and no silent provider fallback.

The live MiMo OAuth/device-flow settings UI is not yet implemented because official endpoint metadata and owner credentials are not present in the repository. It remains a hard release gate rather than a simulated success state.
