# Release evidence

## Identity

- Repository: `https://github.com/leontov/prosmet`
- Branch: `feature/chat-first-estimating-office`
- Release class: vertical slice / canary candidate
- Source archive SHA-256: `be19de4d0ddae384c1fbbd56ff68a892590919dee4c8831e104200b7b2bc5382`

## Implemented evidence

- Source contract for assistant-ui + AG-UI.
- One `/api/agent` event stream.
- Technology card before estimate.
- Interactive inline estimate and immutable local revisions.
- Deterministic independent review.
- Unit and browser test definitions.
- Primary self-hosted CI/canary workflow.
- One-time source reconstruction passed on GitHub Actions run `30324873934`.

## Active verification

- Hosted quality diagnostics and the `prosmet-primary` quality gate are configured against the same feature branch.
- Hosted run `30325071015` reached dependency resolution and failed before compilation; the next diagnostic run persists the complete npm resolver output as an artifact.
- A feature-branch push never deploys: canary is gated to explicit workflow dispatch or a green `main` push.

## Not yet proven

Build, E2E screenshots and deployment status must be filled from completed quality runs. MiMo authentication, PostgreSQL migrations, Better Auth UI, PDF/XLSX/DOCX and full document parity are open gates. They are not represented as complete.
