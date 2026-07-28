# Deployment

GitHub Actions targets labels `[self-hosted, Linux, X64, primary]`. A red source/type/unit/build/E2E gate blocks canary. Canary requires `PROSMET_DEPLOY_DIR`, `PROSMET_CANARY_PORT` and `${PROSMET_DEPLOY_DIR}/.env` on the Primary runner, then builds an immutable Docker image and verifies `/api/health`.

No production promotion workflow is enabled until canary evidence and owner-approved domain routing are present.
