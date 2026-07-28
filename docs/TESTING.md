# Testing

## Automated gates

- Source contract: one `/api/agent`, assistant-ui/AG-UI dependencies, toolkit renderers, interactive state + revision contract and committed-secret scan.
- Unit: extraction, technology completeness, arithmetic, no invented normative code, price warnings and owner-scoped file validation.
- Protocol: lifecycle ordering, state snapshot/delta, tool calls and honest unsupported-domain behavior.
- AI eval catalogue: 52 cases covering estimating domains, documents, provider failure, offline/sync, RBAC, tenant isolation, mobile, voice and performance.
- E2E: Chromium desktop/mobile, request → technology → editable estimate → autosaved revision → reload recovery.

The catalogue defines expected evidence; only capabilities implemented in the current slice may pass. Unimplemented document and provider cases remain red/open rather than being marked successful by fixtures.
