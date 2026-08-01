# Database-first estimates V1

The estimate editor never opens an unpersisted model object.

Canonical flow:

```text
chat request → AI structured estimate → server validation → SQLite transaction → artifact reference → database read → editor
```

The browser workspace is an offline cache. The server database is the source of truth for generated and edited estimates.

Clarification questions remain conversational. A completed estimate becomes a persisted artifact with agent/request lineage before the editor is opened.

Acceptance clears the browser workspace and proves that the estimate is restored from the server database.
