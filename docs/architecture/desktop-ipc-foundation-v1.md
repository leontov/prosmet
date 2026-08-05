# ProSmet desktop IPC foundation v1

## Scope

This slice establishes a narrow, typed and testable Tauri IPC boundary. It does not add filesystem access, secure credentials, shell execution, updater permissions or arbitrary URL opening.

The desktop shell continues to reuse `apps/web/dist`. OS-specific functionality must be added through reviewed adapter interfaces and explicitly allowlisted commands rather than imported into shared React components.

## Command inventory

### `get_app_metadata`

- Input: none.
- Output: product name, application version, Git SHA, operating system, architecture and the production API origin.
- Validation: values are compiled or derived from the current process; no user-controlled path or command exists.
- Secrets: none.
- Audit: not required; read-only diagnostic data.

### `calculate_estimate`

- Input: up to 10,000 lines using integer `quantityMilli` and `unitPriceCents`, plus overhead/profit/VAT basis points.
- Output: integer cents for direct, overhead, profit, VAT and total.
- Validation:
  - unknown JSON fields rejected;
  - negative values rejected;
  - percentage values capped;
  - line count capped;
  - arithmetic overflow mapped to a stable error code.
- Authority: delegates to `crates/estimate-engine`.
- Secrets and filesystem: none.

### `calculate_line`

Backward-compatible command retained for the existing shell. It delegates to the aggregate calculation path with zero percentages. It must not diverge from `calculate_estimate`.

## Error contract

IPC errors use:

```json
{
  "code": "NEGATIVE_LINE_VALUE",
  "message": "line 0 contains a negative value"
}
```

Codes are stable integration identifiers; messages are diagnostic and must not contain secrets or full document content.

## Capability boundary

`apps/desktop/src-tauri/capabilities/default.json` grants only `core:default` to the `main` window. The following capabilities are intentionally absent:

- shell execution;
- recursive home-directory access;
- arbitrary file reads/writes;
- arbitrary external URL opening;
- remote code loading.

Future file export, secure storage and updater slices require separate ADRs, explicit command inventory and capability review.

## CSP review

The current CSP retains:

- `default-src 'self'`;
- no remote scripts;
- no `unsafe-eval`;
- `object-src 'none'`;
- `frame-ancestors 'none'`;
- production API as the only remote `connect-src`.

`style-src 'unsafe-inline'` remains a known compatibility allowance for the shared web styling stack. This slice does not broaden it.

## Verification

```bash
npm run desktop:security -w @prosmet/desktop
npm run desktop:lint -w @prosmet/desktop
npm run desktop:test -w @prosmet/desktop
npm run desktop:verify -w @prosmet/desktop
```

The source contract rejects forbidden command names and capabilities, validates the command allowlist, checks required validation tokens, verifies scripts and checks the CSP baseline.

## Next independent slices

1. system credential storage ADR and adapter;
2. least-privilege native save/open/reveal commands;
3. atomic local drafts and migrations;
4. updater design and signed-artifact boundary;
5. packaged application E2E on Windows, macOS and Linux;
6. TypeScript/Rust/server calculation fixture parity.

## Command module and packaging asset

Tauri command macros live in `src/commands.rs`, while validation and calculation remain ordinary Rust functions in `src/lib.rs`. This prevents macro namespace collisions and keeps the IPC adapter narrow. The repository includes a deterministic RGBA source icon used by the unsigned Linux package gate; native Windows and macOS icon variants remain part of the later signed packaging slice.
