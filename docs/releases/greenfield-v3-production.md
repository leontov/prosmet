# Greenfield V3 production release

This release request contains no application changes.

Target main SHA:

```text
8b61d2b0592ea3e8103fa9bde632d5236ad65471
```

The protected production workflow must checkout and deploy the pull request base SHA from `main`, verify `ui: greenfield` on the public health endpoint, confirm that persistent mobile bottom navigation is absent, and pass desktop/mobile Chromium against `https://kolibriai.online`.
