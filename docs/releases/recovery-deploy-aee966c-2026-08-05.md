# ProSmet exact-main recovery deployment

Trigger the isolated public-root recovery pipeline to build and deploy the current `main` revision:

`aee966c356377be3d2e676679912bd705907c1ae`

This branch is operational only. The workflow fetches and checks out `origin/main`, builds the browser application, installs an immutable release, switches the persistent process on port 3200, reconciles the canonical HTTPS edge, and verifies the public origin externally.
