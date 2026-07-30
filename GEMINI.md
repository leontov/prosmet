# Gemini repository instructions

Use [`AGENTS.md`](./AGENTS.md) as the binding instruction file for the entire repository.

Mandatory startup sequence:

1. `AGENTS.md`;
2. `docs/PROJECT_SOURCE_OF_TRUTH.md`;
3. `docs/AGENT_CONTEXT_INDEX.md`;
4. `docs/AGENT_ENGINEERING_PLAYBOOK.md` and `docs/AGENT_TASK_TEMPLATE.md`;
5. relevant product/UX/A2A contracts;
6. exact `main` SHA;
7. latest `Prosmet Main Production` jobs and failed log;
8. `docs/WRITE_ACTIONS_RECOVERY.md` when repository write, PR or Actions capabilities fail.

Work only on the verified blocker, preserve assistant-ui + AG-UI + PostgreSQL/IndexedDB invariants, and continue until the public `https://kolibriai.online` exact-SHA release reports `MAIN PRODUCTION PASS`.
