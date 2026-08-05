# Mobile user session foundation

## Decision

The mobile application uses three explicit HTTP scopes:

- `public` for registration and public service metadata;
- `user` for the signed HttpOnly user-session cookie;
- `admin` only for technical agent and server administration.

The normal user flow never adds `x-prosmet-admin-token`. The admin token remains an optional SecureStore credential for the owner-only control plane and is not treated as a user login.

## User flow

1. `POST /api/register` creates the account and signed session.
2. `POST /api/auth/login` authenticates an existing account.
3. `GET /api/auth/session` restores the native cookie-container session on launch.
4. `DELETE /api/auth/logout` expires the session.

Passwords remain only in transient component state, are never written to SecureStore, and are cleared after successful authentication.

## Runtime validation

`apps/mobile/src/domain/user-session.ts` validates critical auth responses before they enter application state. An authenticated response must include a complete user ID, name, email, company, role, status and timestamps.

## Verification boundary

The canonical source tree intentionally excludes generated browser screenshots, Lighthouse reports and Cargo build output. Those files remain CI artifacts rather than version-controlled application source. The final pull-request head must pass the hosted Greenfield quality workflow after this cleanup.

## Current boundary

This slice establishes registration, login, restore and logout. It does not claim completion of typed navigation, multi-tenant estimate ownership, offline cache, native file export/share or Maestro device E2E; those remain separate milestones in issue #71.
