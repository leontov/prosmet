# Mobile polish, branded exports and user registration

Acceptance target:

- Mobile web UI receives a restrained ProSmet brand color layer.
- PDF export opens a branded Cyrillic print document suitable for Save as PDF.
- Excel export downloads a branded Excel-compatible workbook.
- User registration persists to SQLite through `/api/register`.
- Admin-only `/api/users` and `/api/users/:id` support verification and deterministic cleanup.
- All contracts, TypeScript, unit tests, Playwright and Lighthouse gates must pass before merge.
