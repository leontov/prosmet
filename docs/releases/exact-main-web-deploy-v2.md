# Exact-main web deployment v2

Deploy production from the immutable current `main` revision:

`aee966c356377be3d2e676679912bd705907c1ae`

This operational branch is isolated from the stale `prosmet-production` concurrency queue. It must install the browser build on `prosmet-primary`, reconcile `kolibriai.online`, verify every public IPv4, run desktop/mobile Chromium acceptance, and publish the exact result to issue #53.
