# Gemini repository instructions

Use [`AGENTS.md`](./AGENTS.md) as the binding instruction file for the entire repository.

Mandatory startup sequence:

1. `AGENTS.md`;
2. `docs/AGENT_CONTEXT_INDEX.md`;
3. relevant product/UX/A2A contracts;
4. exact `main` SHA;
5. latest `Prosmet Main Production` jobs and failed log.

Work only on the verified blocker, preserve assistant-ui + AG-UI + PostgreSQL/IndexedDB invariants, and continue until the public `https://kolibriai.online` exact-SHA release reports `MAIN PRODUCTION PASS`.