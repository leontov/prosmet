# ProSmet UI polish V1

## Design source

The mobile shell is calibrated against the approved iPhone references supplied for ProSmet: white canvas, system typography, outlined circular controls, left swipe drawer, compact bottom composer, message-state header switch, and open list-based navigation.

Desktop remains a separate work surface with a restrained sidebar, compact top bar, wide conversation canvas, document-oriented estimate editor, and persistent project context.

## Shared visual system

- Canvas: `#ffffff`
- Soft surface: `#f1f1f2`
- Primary text: `#111214`
- Secondary text: `#66676a`
- Faint text: `#9a9b9e`
- Border: `rgba(17,18,20,.12)`
- Strong outline: `rgba(17,18,20,.78)`
- Primary action: `#0a84ff`
- System font stack on iOS; platform-native fallback on Android and desktop
- Assistant UI primitives remain the owner of message, composer, action, speech, feedback, and runtime state

## Acceptance surfaces

1. Empty mobile chat and filled mobile chat
2. Swipe drawer and all primary navigation destinations
3. Desktop chat shell
4. Desktop and mobile estimate editor
5. Project lifecycle inspector
6. Commercial proposal, invoice, contract, act, KS-2 and KS-3 viewer
7. Projects, estimates, documents and regional price catalog lists

## Quality gates

- No estimate artifact for greeting or document-only intent
- Full construction lifecycle E2E
- Desktop and mobile Chromium acceptance
- No console, page, request or CSP violations on the critical path
- Keyboard-visible focus treatment
- Reduced-motion fallback
- No mobile bottom navigation
- Composer placeholder remains one line at the reference viewport
- Mobile workflow control occupies a reserved compact slot in the sticky action rail and does not cover estimate content
- Every newly generated estimate receives an isolated project identity, draft lifecycle status and zero factual progress, even when title and region match an earlier completed project
- Source, assistant-ui architecture, TypeScript, unit, Rust and production build checks pass
