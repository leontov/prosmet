# Claude repository instructions

The binding repository instructions are in [`AGENTS.md`](./AGENTS.md).

Before changing any file:

1. read `AGENTS.md` completely;
2. read `docs/PROJECT_SOURCE_OF_TRUTH.md`;
3. read `docs/AGENT_CONTEXT_INDEX.md`;
4. read `docs/AGENT_ENGINEERING_PLAYBOOK.md` and `docs/AGENT_TASK_TEMPLATE.md`;
5. load the relevant product, UX and A2A contracts;
6. inspect the exact `main` SHA and latest production workflow failure;
7. use `docs/WRITE_ACTIONS_RECOVERY.md` for connector/PR/Actions permission failures;
8. continue the failure loop until `MAIN PRODUCTION PASS` on `https://kolibriai.online`.

Do not create an alternative architecture, second chat runtime, new product module outside the active release, or a completion report before the exact-SHA public HTTPS gate passes.
