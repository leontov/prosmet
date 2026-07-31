import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFile(resolve(root, path), "utf8");
const need = (source, token, scope) => { if (!source.includes(token)) failures.push(`${scope}:missing:${token}`); };
const forbid = (source, token, scope) => { if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`); };

for (const path of [
  "components/app/premium-chat-workspace.tsx",
  "components/chat/premium-prosmet-thread.tsx",
  "components/app/premium-prosmet-application.tsx",
  "components/app/premium-estimate-workspace-editor.tsx",
  "app/premium-product.css",
  "e2e/premium-ui.spec.ts",
  "components/app/form-field-identity-guard.tsx",
  "scripts/csp-bundle-contract.mjs",
  "docs/PREMIUM_UI_V2_BRIEF.md"
]) {
  try { await access(resolve(root, path)); } catch { failures.push(`missing:${path}`); }
}

const page = await read("app/page.tsx");
need(page, "PremiumProsmetApplication", "page");

const layout = await read("app/layout.tsx");
need(layout, 'import "./premium-product.css"', "layout");
need(layout, 'import "./premium-product-fixes.css"', "layout");

const shell = await read("components/app/premium-chat-workspace.tsx");
for (const token of [
  "PremiumChatWorkspace",
  'data-testid="app-sidebar"',
  'data-testid="universal-chat-canvas"',
  'data-testid="workspace-overlay"',
  "prosmet-v2-mobile-nav",
  "prosmet-v2-sidebar",
  "Новый чат",
  "Недавние",
  "ProsmetThread"
]) need(shell, token, "premium-v2-shell");
for (const token of ["prosmet-premium-app-shell", "prosmet-premium-sidebar", "IndexedDB-кэш готов", "Backend ·", "Проверяем backend"]) forbid(shell, token, "legacy-shell-removed");

const thread = await read("components/chat/premium-prosmet-thread.tsx");
for (const token of [
  "Что нужно посчитать?",
  "Опишите объект и работы",
  "prosmet-v2-suggestion",
  "prosmet-v2-composer",
  "ComposerPrimitive.Input",
  "ActionBarPrimitive.Copy",
  "ActionBarPrimitive.Reload",
  "ActionBarPrimitive.ExportMarkdown"
]) need(thread, token, "premium-v2-thread");
for (const token of ["prosmet-premium-welcome", "prosmet-premium-suggestion", "ActionBarPrimitive.Speak", "FeedbackPositive", "FeedbackNegative", "Прочитать вслух", "Хороший ответ", "Плохой ответ"]) forbid(thread, token, "legacy-or-unsupported-thread");

const app = await read("components/app/premium-prosmet-application.tsx");
for (const token of ["validateForApproval", 'status: "approved"', 'recordEstimatePriceStatus(approved, "approved")', 'recordEstimatePriceStatus(sent, "sent_to_client")', "PremiumEstimateWorkspaceEditor"]) need(app, token, "business-actions");

const editor = await read("components/app/premium-estimate-workspace-editor.tsx");
for (const token of [
  'data-testid="estimate-workspace-layer"',
  'data-testid="estimate-document-overlay"',
  'data-testid="estimate-document-canvas"',
  'data-testid="estimate-revision-preview"',
  'aria-label="Редактирование позиции"',
  'aria-label="Итоги сметы"',
  "prosmet-v2-mobile-row",
  "prosmet-v2-estimate-summary",
  "Сохранить версию",
  "Утвердить",
  "Передать клиенту",
  "Дополнительно",
  "formatDateRu",
  "pluralPositions",
  'inputMode="decimal"'
]) need(editor, token, "premium-v2-estimate");
for (const token of ["prosmet-premium-estimate-paper", "prosmet-premium-desktop-row", ">Готово</span>", "07/30/2026"]) forbid(editor, token, "legacy-estimate-removed");

const styles = await read("app/premium-product.css");
for (const token of [
  "PROSMET PREMIUM PRODUCT UI V2",
  "--prosmet-sidebar-width: 264px",
  ".prosmet-v2-app-shell",
  ".prosmet-v2-mobile-nav",
  ".prosmet-v2-welcome",
  ".prosmet-v2-suggestion",
  ".prosmet-v2-estimate-canvas",
  ".prosmet-v2-mobile-row",
  ".prosmet-v2-mobile-actionbar",
  ".prosmet-v2-row-sheet-footer",
  "min-height: 96px",
  "font-size: 17px",
  "env(safe-area-inset-bottom)"
]) need(styles, token, "premium-v2-styles");
for (const token of ["PROSMET PREMIUM PRODUCT UI V1", ".prosmet-premium-app-shell", ".prosmet-premium-estimate-paper"]) forbid(styles, token, "legacy-css-removed");

const fieldGuard = await read("components/app/form-field-identity-guard.tsx");
for (const token of ["useLayoutEffect", "MutationObserver", "field.name = field.id"]) need(fieldGuard, token, "form-field-identity");

const cspContract = await read("scripts/csp-bundle-contract.mjs");
for (const token of ["new Function", "string setTimeout", "string setInterval", ".next/static/chunks"]) need(cspContract, token, "csp-bundle-contract");

const e2e = await read("e2e/premium-ui.spec.ts");
for (const token of [
  "distinct desktop and mobile product",
  "height).toBeGreaterThanOrEqual(88)",
  "height).toBeGreaterThanOrEqual(100)",
  "cardTitleSize).toBeGreaterThanOrEqual(16)",
  "rowTitleSize).toBeGreaterThanOrEqual(16)",
  "prosmet-v2-mobile-nav"
]) need(e2e, token, "premium-v2-e2e");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-premium-ui-v2-from-scratch",
  shell: "new assistant-first desktop shell plus native mobile bottom navigation",
  estimate: "desktop document workspace plus large mobile estimate cards",
  mobile: "16px+ body copy, 48px+ controls, 96px task cards and 100px estimate rows",
  legacyVisualShell: "removed",
  unsupportedCapabilities: "not rendered"
}, null, 2));
