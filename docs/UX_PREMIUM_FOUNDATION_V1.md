# PROSMET UX PREMIUM FOUNDATION V1

## Canonical production surface

- Public origin: `https://kolibriai.online`
- Internal application listener: `http://127.0.0.1:3200`
- Public IPv4: `78.17.4.108`
- TLS edge: Caddy with automatic certificate issuance and renewal
- Canonical host: apex domain `kolibriai.online`

The raw IP and port are compatibility and diagnostic endpoints only. User-facing links, metadata, cookies, sharing and release evidence must use the HTTPS origin.

## DNS contract

The authoritative DNS zone must contain:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `78.17.4.108` | 300 |
| CNAME | `www` | `kolibriai.online` | 300 |

Do not publish an AAAA record until the Primary host has a tested public IPv6 route. Ports TCP/80, TCP/443 and UDP/443 must be reachable. The deployment fails closed until the apex A record resolves to the Primary public IPv4.

## Frozen visual references

The V1 reference set is the exact Chromium evidence from release `6114594350cc422add62cc5a2d40cf5240530e6c`:

- `artifacts/screenshots/estimate-workspace-desktop-chromium.png`
- `artifacts/screenshots/estimate-workspace-mobile-chromium.png`
- `artifacts/screenshots/estimate-row-sheet-mobile-chromium.png`
- `artifacts/screenshots/estimate-mobile-chromium.png`

These references preserve the accepted product skeleton:

- compact estimate card in the assistant thread;
- left navigation, focused estimate document and supporting chat on expanded desktop;
- estimate sheet on compact/mobile windows;
- separate bottom sheet for editing one estimate row;
- ChatGPT/Codex-like restrained white and cool-neutral visual language.

V1 improvements may correct clipping, focus, touch targets, safe areas, responsive pane choice and unsupported controls. They must not introduce a new product module or replace the accepted information architecture.

## Design tokens

The source-of-truth runtime tokens are declared in `app/premium-foundation.css` and existing application CSS.

| Token | Value | Purpose |
|---|---:|---|
| `--prosmet-touch-target` | `44px` | minimum high-frequency mobile action size |
| `--prosmet-focus-ring` | blue 3 px halo | visible keyboard focus |
| `--prosmet-motion-fast` | `120ms` | direct control feedback |
| `--prosmet-motion-normal` | `180ms` | sheet and surface transitions |
| `--prosmet-surface` | `#ffffff` | primary content surface |
| `--prosmet-canvas` | `#f5f6f8` | supporting canvas |
| `--prosmet-text` | `#202123` | primary text |
| `--prosmet-muted-text` | `#6b6f76` | secondary text |
| `--prosmet-divider` | `rgba(15,23,42,.1)` | borders and separators |

## Adaptive shell contract

- `< 768 px`: one primary surface; estimate and row editors use sheets.
- `768–1023 px`: navigation rail plus one primary surface.
- `1024–1279 px`: estimate document replaces the supporting chat while editing.
- `>= 1280 px`: navigation + estimate + supporting chat where width permits.

No visible estimate content may require horizontal page scrolling. On touch pointers, high-frequency controls must meet the 44 px target policy.

## Capability policy

Speech playback and feedback controls are hidden until real adapters are configured. Dictation remains capability-gated by assistant-ui. A disabled or absent adapter must never produce an interactive control or a production console error.

## Accessibility gate

- visible `:focus-visible` treatment;
- no focus hidden below sticky toolbars or sheet footers;
- reduced-motion support;
- keyboard-operable primary flow;
- touch targets conforming to the V1 token;
- dialogs remain above message paint containment on narrow viewports;
- no essential information conveyed by color alone.

## HTTPS acceptance gate

The release is accepted only when all of the following pass on the exact main SHA:

1. Source contracts, strict typecheck, unit tests and production build.
2. Desktop and mobile Chromium before deployment.
3. Immutable application deployment to port 3200.
4. DNS apex resolves to `78.17.4.108`.
5. Caddy obtains a valid certificate for `kolibriai.online`.
6. HTTP redirects to HTTPS.
7. HTTPS sends HSTS and the production CSP has no `unsafe-eval` or WASM eval.
8. `/api/health` on the public domain reports the exact deployed SHA.
9. Desktop and mobile Chromium smoke run against the live HTTPS origin.
10. The release artifact contains public headers, TLS status, logs and live screenshots.

`MAIN PRODUCTION PASS` is the only completion state.
