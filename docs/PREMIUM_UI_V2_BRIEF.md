# PROSMET PREMIUM UI V2 — FROM-SCRATCH REBUILD

## Goal

Replace the legacy desktop-derived interface with a new assistant-first product UI built independently for desktop and mobile.

## Non-negotiable outcomes

- no reuse of the old visual shell;
- calm Codex/GPT-like visual language without bright brand colors;
- desktop: focused assistant workspace with compact navigation and a generous working canvas;
- mobile: native information architecture with bottom navigation, large task cards, 16px+ body text and 48px+ touch targets;
- estimate mobile UI is card-based, not a compressed table;
- project actions appear only inside project and estimate contexts;
- save version, approve and deliver remain separate actions;
- all current domain logic, PostgreSQL persistence, IndexedDB outbox, Rust calculation, PDF/XLSX and provider adapters remain intact;
- old Premium Product V1 selectors and layout contract are replaced by V2;
- desktop and mobile screenshots must visibly differ as intentionally designed products;
- completion requires exact-main production deployment and live HTTPS desktop/mobile E2E.
