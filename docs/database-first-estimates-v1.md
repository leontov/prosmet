# Database-first estimates V1

The estimate editor never opens an unpersisted model object.

Canonical flow:

```text
chat request → AI structured estimate → server validation → SQLite transaction → artifact reference → database read → editor
```

The browser workspace is an offline cache. The server database is the source of truth for generated and edited estimates.
