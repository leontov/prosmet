# Streaming chat contract

The root workspace uses `assistant-ui` and the AG-UI runtime.

## Frontend

- `app/MyRuntimeProvider.tsx` mounts one `AssistantRuntimeProvider` and creates an AG-UI `HttpAgent` for `/api/agent`.
- `components/chat/prosmet-thread.tsx` owns the thread viewport, composer, streaming text, stop/cancel, retry, branches, attachments and interactive tool parts.
- `components/app/chat-workspace.tsx` provides one ChatGPT/Codex-style shell and registers starter suggestions and the domain toolkit.
- `app/toolkit.tsx` maps streamed `technology_card`, `estimate_draft` and document tools to editable in-chat components.

## Backend

`app/api/agent/route.ts` returns `text/event-stream` and emits AG-UI lifecycle, text, activity, state and tool-call events. Tool arguments are streamed incrementally so the technology card and estimate can render before the full run ends.

## Acceptance

The Playwright gate verifies message submission, visible streaming text, technology-card rendering, estimate editing and approval, cancellation, local SQLite persistence, reload restoration and desktop/mobile screenshots.
