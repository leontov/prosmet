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
- production CSP stays strict: no `unsafe-eval`, `eval`, `new Function` or string timers in the shipped bundle;
- every rendered `input`, `textarea` and `select` has a stable `id` and `name`, including dynamically created assistant fields;
- desktop and mobile screenshots must visibly differ as intentionally designed products;
- completion requires exact-main production deployment and live HTTPS desktop/mobile E2E.

## Browser security acceptance

Desktop and mobile Chromium must record zero `securitypolicyviolation` events, zero console security errors and zero rendered form controls without both `id` and `name`. The production bundle is rejected before deployment if it contains string-evaluation constructs.

Both the hosted verification and the canonical `prosmet-primary` verification must pass; only the Primary production run is allowed to declare the release complete.

PDF and XLSX generation runs in the Node export API; browser chunks contain only fetch/download code. Zod is imported through the project jitless wrapper before schemas are constructed.
