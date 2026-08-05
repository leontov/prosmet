# Home-to-Primary exact-main deployment

Deploy immutable current `main` revision:

`aee966c356377be3d2e676679912bd705907c1ae`

The release is built on the trusted Home runner, transferred through the existing Home-to-Primary SSH certificate route, activated on port 3200 with rollback protection, then verified through the canonical HTTPS edge and an external Chromium acceptance job.
