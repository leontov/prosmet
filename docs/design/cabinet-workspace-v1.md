# ProSmet cabinet workspace v1

## Product intent

The cabinet is an operational account workspace rather than a promotional registration page. It separates three concerns:

1. **User identity** — session, role, email and organization membership.
2. **Organization profile** — contractor details used by estimates and generated documents.
3. **Technical service state** — active AI agent, persistence, release revision and administrator boundary.

## Desktop composition

- Open identity header without a surrounding marketing card.
- Compact four-column status strip.
- Main two-column workspace: organization/access on the left, system inspector on the right.
- Sticky inspector at wide desktop sizes.
- No modal dialogs.

## Mobile composition

- One-column order: identity, status, organization, access, agent, system and security.
- 48 px primary touch targets.
- No horizontal overflow.
- Same functionality as desktop web.

## Theme contract

All surfaces use the existing semantic tokens: `--pro-canvas`, `--pro-soft-2`, `--pro-ink`, `--pro-muted`, `--pro-line`, `--pro-green`, `--pro-amber`, `--pro-red` and `--pro-blue`.

No cabinet surface is hard-coded white. Explicit dark and system-dark regression checks enforce luminance and WCAG AA text contrast.
