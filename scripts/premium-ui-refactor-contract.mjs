import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFile(resolve(root, path), "utf8");
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};
const forbid = (source, token, scope) => {
  if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`);
};

for (const path of [
  "components/app/premium-chat-workspace.tsx",
  "components/chat/premium-prosmet-thread.tsx",
  "components/app/premium-prosmet-application.tsx",
  "components/app/premium-estimate-workspace-editor.tsx",
  "app/premium-product.css",
  "e2e/premium-ui.spec.ts"
]) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
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
  "Новый чат",
  "Недавние",
  "PremiumProsmetThread"
]) need(shell, token, "premium-shell");
for (const token of ["IndexedDB-кэш готов", "Backend ·", "Проверяем backend"]) {
  forbid(shell, token, "customer-shell-no-service-noise");
}

const thread = await read("components/chat/premium-prosmet-thread.tsx");
for (const token of [
  "Что нужно посчитать?",
  "Опишите объект и работы",
  "ComposerPrimitive.Input",
  "ActionBarPrimitive.Copy",
  "ActionBarPrimitive.Reload",
  "ActionBarPrimitive.ExportMarkdown"
]) need(thread, token, "premium-thread");
for (const token of [
  "ActionBarPrimitive.Speak",
  "FeedbackPositive",
  "FeedbackNegative",
  "Прочитать вслух",
  "Хороший ответ",
  "Плохой ответ"
]) forbid(thread, token, "unsupported-capabilities");

const app = await read("components/app/premium-prosmet-application.tsx");
for (const token of [
  "validateForApproval",
  'status: "approved"',
  'recordEstimatePriceStatus(approved, "approved")',
  'recordEstimatePriceStatus(sent, "sent_to_client")',
  "PremiumEstimateWorkspaceEditor"
]) need(app, token, "business-actions");

const editor = await read("components/app/premium-estimate-workspace-editor.tsx");
for (const token of [
  'data-testid="estimate-workspace-layer"',
  'data-testid="estimate-document-overlay"',
  'data-testid="estimate-document-canvas"',
  'data-testid="estimate-revision-preview"',
  'aria-label="Редактирование позиции"',
  "Сохранить версию",
  "Утвердить",
  "Передать клиенту",
  "Дополнительно",
  "formatDateRu",
  "pluralPositions",
  "inputMode=\"decimal\""
]) need(editor, token, "premium-estimate");
for (const token of [">Готово</span>", "07/30/2026"]) forbid(editor, token, "premium-estimate-copy");

const styles = await read("app/premium-product.css");
for (const token of [
  "--prosmet-sidebar-width: 280px",
  ".prosmet-premium-app-shell",
  ".prosmet-premium-welcome",
  ".prosmet-premium-estimate-paper",
  ".prosmet-premium-mobile-actionbar",
  ".prosmet-premium-row-sheet-footer",
  '@media (min-width: 1024px) and (max-width: 1599px)',
  '@media (min-width: 1600px)',
  "font-size: 16px",
  "env(safe-area-inset-bottom)"
]) need(styles, token, "premium-styles");

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  contract: "prosmet-premium-ui-refactor-v1",
  shell: "assistant-first, quiet, customer-facing",
  estimate: "responsive document workspace with separated business actions",
  mobile: "single surface + compact metadata + keyboard-safe row sheet",
  unsupportedCapabilities: "not rendered"
}, null, 2));
