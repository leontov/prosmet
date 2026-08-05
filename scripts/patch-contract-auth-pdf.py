from pathlib import Path

path = Path("scripts/greenfield-contract.mjs")
source = path.read_text(encoding="utf-8")

old_required = '''  "apps/web/src/features/estimate/branded-export.ts",
  "apps/web/src/features/account/UserRegistrationPanel.tsx",
  "apps/web/e2e/registration-export.spec.ts",'''
new_required = '''  "apps/web/src/features/estimate/branded-export.ts",
  "apps/web/src/features/estimate/branded-pdf.ts",
  "apps/web/src/types/pdfmake-build.d.ts",
  "apps/web/src/features/account/UserRegistrationPanel.tsx",
  "apps/web/e2e/registration-export.spec.ts",
  "apps/web/e2e/registration-session.spec.ts",
  "apps/web/e2e/registration-ui.spec.ts",'''
if source.count(old_required) != 1:
    raise SystemExit("required export/auth file marker missing")
source = source.replace(old_required, new_required, 1)

old_guard = '''for (const token of ["CREATE TABLE IF NOT EXISTS registered_users", 'url.pathname === "/api/register"', 'url.pathname === "/api/users"', "hashRegisteredPassword", "scryptSync"]) { if (!server.includes(token)) failures.push(`registration:server-contract-missing:${token}`); }
if (!webAccount.includes("UserRegistrationPanel")) failures.push("registration:account-ui-missing");
if (!webEstimate.includes("buildBrandedPrintHtml") || !webEstimate.includes("buildBrandedExcelHtml")) failures.push("exports:branded-pdf-excel-missing");'''
new_guard = '''for (const token of [
  "CREATE TABLE IF NOT EXISTS registered_users",
  'url.pathname === "/api/register"',
  'url.pathname === "/api/users"',
  'url.pathname === "/api/auth/login"',
  'url.pathname === "/api/auth/session"',
  'url.pathname === "/api/auth/logout"',
  "hashRegisteredPassword",
  "verifyRegisteredPassword",
  "createUserSession",
  "scryptSync"
]) {
  if (!server.includes(token)) failures.push(`registration:server-contract-missing:${token}`);
}
if (!webAccount.includes("UserRegistrationPanel")) failures.push("registration:account-ui-missing");
if (!webEstimate.includes("downloadBrandedPdf") || !webEstimate.includes("buildBrandedExcelHtml")) failures.push("exports:branded-pdf-excel-missing");'''
if source.count(old_guard) != 1:
    raise SystemExit("registration/export guard marker missing")
source = source.replace(old_guard, new_guard, 1)
source = source.replace(
    'editor: "working local workspace with print, Excel and system sharing",',
    'editor: "working local workspace with real PDF, Excel and system sharing",',
    1
)
path.write_text(source, encoding="utf-8")
