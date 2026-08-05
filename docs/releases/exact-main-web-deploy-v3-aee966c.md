# Exact-main production deployment V3

Target release:

`aee966c356377be3d2e676679912bd705907c1ae`

The workflow uses the active self-hosted runner, verifies `runner.name == prosmet-primary`, performs an immutable build and candidate preflight, switches port 3200 with rollback protection, reconciles the canonical HTTPS edge, verifies persistence after runner cleanup, and runs external IPv4 plus desktop/mobile Chromium acceptance.
