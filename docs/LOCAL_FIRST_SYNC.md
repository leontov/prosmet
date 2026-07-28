# Local-first and sync

IndexedDB stores threads, messages, immutable estimate revisions, outbox operations and an optional exported SQLite database file. SQLite-WASM provides relational local queries through a mirror. The current slice persists chat and estimate revisions after reload and queues mutations in outbox.

Server push/pull cursor reconciliation and cross-device conflict resolution are not yet wired to PostgreSQL; no claim is made that multi-device sync is complete.
