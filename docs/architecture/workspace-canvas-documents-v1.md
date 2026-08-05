# Workspace Canvas and Production Documents V1

## Scope

This slice changes the desktop/web presentation model without replacing the existing ProSmet business lifecycle or API. It addresses the highest-impact UX defects first:

- fixed left sidebar;
- modal estimate/workflow/document overlays;
- PDF download with no in-app preview;
- HTML disguised as `.xls`;
- list-like construction documents with no editable legal readiness gate.

Mobile retains its full-screen editor composition in this slice. The native mobile production track is tracked separately in issue #71.

## Workspace architecture

Desktop uses three persistent regions:

1. resizable/collapsible navigation sidebar;
2. assistant/content workspace;
3. resizable artifact canvas.

The artifact canvas owns one active artifact at a time:

- estimate editor;
- PDF preview;
- project workflow;
- construction document.

It can expand to full screen without navigation or a new browser page. Pane dimensions are stored as non-sensitive UI preferences. Separators are pointer- and keyboard-operable.

Primary work surfaces must not use modal semantics. Confirmation alerts may still be used for destructive actions until they are migrated to an explicit confirmation surface.

## PDF

The existing PDFMake definition remains the canonical presentation definition. The runtime now obtains a Blob, verifies the `%PDF-` signature and renders it in a local `blob:` iframe inside the artifact canvas. Download is an explicit secondary action.

CSP is extended only with `frame-src 'self' blob:`. Remote frames remain prohibited.

## Excel

The previous implementation generated HTML and assigned an `.xls` suffix. V1 replaces it with a valid OpenXML `.xlsx` package generated without an additional dependency.

The workbook includes:

- `[Content_Types].xml` and package relationships;
- workbook, worksheet and styles parts;
- UTF-8/Cyrillic inline strings;
- branded colors;
- merged identity rows;
- frozen table header;
- currency number format;
- totals and landscape print setup.

Tests validate the ZIP `PK` signature, mandatory OpenXML parts and branded content.

## Document editing

Generated documents remain server-persisted construction lifecycle artifacts. The canvas exposes editable:

- heading;
- introduction;
- clauses;
- notes.

The original estimate sections and monetary totals remain server-derived and are not silently overwritten by document text editing.

## Russian contract template boundary

The template is structured around the essential construction contract subjects:

- parties and subject;
- scope and estimate attachment;
- initial/final/intermediate deadlines;
- fixed/approximate price;
- payment;
- materials;
- handover and acceptance;
- quality and warranty;
- liability;
- variation/termination;
- force majeure;
- disputes;
- consumer-specific mandatory protections;
- appendices, requisites and signatories.

A contract-readiness checklist prevents an unfinished placeholder template from being presented as ready for signature. The template is not a universal legal opinion: party status, project facts, mandatory permits, taxation and jurisdiction must be checked for the concrete transaction.

Reference framework recorded in the product note:

- Civil Code of the Russian Federation, general contract rules and construction contract provisions, including Articles 702, 708, 709, 720, 740, 743, 746 and 753–755;
- Law of the Russian Federation No. 2300-1 when the customer is a consumer.

## Security boundaries

- no remote iframe origins;
- no arbitrary HTML is accepted from the server for preview;
- document text is escaped in print HTML;
- no credential or admin-token handling changes;
- no arbitrary file-system access;
- document updates use the existing same-origin API and server-side storage.

## Acceptance

- ordinary `Prosmet Greenfield Quality` passes;
- desktop editor is a region, not an aria-modal dialog;
- left and right separators are visible and keyboard-accessible;
- PDF appears in the canvas and downloads as a valid PDF;
- Excel downloads as `.xlsx` with a ZIP signature and OpenXML worksheet;
- estimate edits still persist and survive reload;
- workflow and document lifecycle tests remain green;
- Lighthouse budgets remain green.
