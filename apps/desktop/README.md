# Prosmet Desktop

Tauri 2 shell for macOS, Windows and Linux. It opens only the configured Prosmet HTTPS origin and does not grant remote pages Tauri IPC permissions. The bundled Rust core exposes the same deterministic calculation engine for future fully-offline desktop workflows.

```bash
npm install
npm run dev
npm run build
```

Code signing and notarization credentials are intentionally supplied only through release CI secrets.
