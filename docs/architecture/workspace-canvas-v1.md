# Workspace Canvas V1

Implemented in PR #73:

- resizable left navigation pane;
- resizable right artifact pane;
- persisted pane widths;
- keyboard-accessible resize handles;
- full-screen artifact mode;
- system, light and dark theme control;
- estimate, workflow and document surfaces embedded in the workspace instead of primary modal dialogs;
- in-app PDF preview before download;
- real OpenXML `.xlsx` export with ProSmet styling;
- editable document text persisted through the existing workflow API;
- explicit contract-completeness checks for fields that require user input.

Verification run `31002110605` completed clean install, contracts, TypeScript, unit and Rust tests, production build, Playwright desktop/mobile/lifecycle/export tests, desktop metadata and Lighthouse. Evidence artifact: `8928755365`.

Known follow-up: the existing wide estimate table is functional but visually dense at the minimum right-pane width. The next UI pass should use a compact single-column estimate layout below the wide-editor breakpoint.
