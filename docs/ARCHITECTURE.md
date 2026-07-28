# Architecture

```text
Browser / PWA
  assistant-ui primitives + Toolkit
  @assistant-ui/react-ag-ui + HttpAgent
  attachments + browser voice
  IndexedDB threads/revisions/outbox + SQLite-WASM query mirror
          │ AG-UI SSE
          ▼
POST /api/agent
  Chief Estimator orchestration
  technology → estimate → reviewer
          │
  explicit AgentProvider interface (MiMo/OpenAI-compatible/Ollama)
          │
PostgreSQL + Drizzle (tenant-scoped system of record)
S3-compatible adapter (production) / owner-scoped filesystem adapter (development)
```

The deterministic estimator is domain logic for the validated plastering slice. It is not an LLM fixture and never claims external price freshness. Unsupported domains do not receive a fabricated plastering estimate. Production provider routing is explicit; unavailable providers must return a visible error rather than a hidden fallback.
