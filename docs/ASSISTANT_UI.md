# assistant-ui

`KolibriRuntimeProvider` creates one AG-UI `HttpAgent`, registers the official `useAgUiRuntime`, disables visible thinking, and registers a `defineToolkit` map. Backend tool names are mapped to `type: "backend"` renderers, so tools execute server-side while the browser renders rich domain UI.

Implemented primitives include Thread, Composer, Message, ActionBar, BranchPicker, Suggestions, Cancel, Edit, Reload, attachment dropzone/picker, attachment lifecycle, browser dictation and speech synthesis. The attachment adapter uploads to an owner-scoped server route; URLs, not browser file paths or credentials, are sent in message content.

`estimate_draft` uses `useAgUiSetState` for optimistic state updates and creates immutable local revisions after edits. Tool calls remain attached to the same assistant message through `parentMessageId`.
