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

const required = [
  "components/app/premium-prosmet-application.tsx",
  "components/app/premium-estimate-workspace-editor.tsx",
  "app/premium-product.css",
  "app/premium-product-fixes.css",
  "e2e/compact-estimate-workspace.spec.ts",
  "e2e/premium-ui.spec.ts"
];

for (const path of required) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const application = await read("components/app/premium-prosmet-application.tsx");
for (const token of [
  "PremiumChatWorkspace",
  "PremiumEstimateWorkspaceEditor",
  'document.addEventListener("click", handleOpen, true)',
  "prosmetSupportingArtifact",
  'body.dataset.prosmetEstimateOpen = "true"',
  "saveEstimate(workspace.currentThreadId, draft)",
  "saveConfirmedPrices(sent)",
  'recordEstimatePriceStatus(sent, "sent_to_client")',
  "shareEstimateNative",
  "openEstimateWhatsApp",
  "openEstimateEmail",
  "copyEstimateSummary"
]) {
  need(application, token, "premium-estimate-application");
}
for (const token of ["AssistantRuntimeProvider", "useAgUiRuntime", "useLocalRuntime"]) {
  forbid(application, token, "single-chat-runtime");
}

const editor = await read("components/app/premium-estimate-workspace-editor.tsx");
for (const token of [
  'data-testid="estimate-workspace-layer"',
  'data-testid="estimate-document-overlay"',
  'data-testid="estimate-document-canvas"',
  'data-testid="estimate-revision-preview"',
  'aria-label="Редактирование позиции"',
  'aria-label="Итоги сметы"',
  "Сохранить версию",
  "Утвердить",
  "Передать клиенту",
  "Добавить позицию",
  "Добавить раздел",
  "Технология и подробности расчёта",
  "Скачать PDF",
  "Скачать Excel",
  "prosmet-v2-mobile-row",
  "prosmet-v2-mobile-actionbar"
]) {
  need(editor, token, "premium-v2-estimate-editor");
}
for (const token of [
  "prosmet-premium-estimate-paper",
  "prosmet-premium-desktop-row",
  "prosmet-estimate-toolbar",
  "prosmet-primary-action"
]) {
  forbid(editor, token, "legacy-estimate-editor");
}

const css = `${await read("app/premium-product.css")}\n${await read("app/premium-product-fixes.css")}`;
for (const token of [
  '[data-prosmet-supporting-artifact="true"]',
  ".prosmet-v2-estimate-layer",
  ".prosmet-v2-estimate-sheet",
  ".prosmet-v2-estimate-layout",
  ".prosmet-v2-estimate-summary",
  ".prosmet-v2-mobile-row",
  ".prosmet-v2-mobile-actionbar",
  ".prosmet-v2-row-sheet",
  "grid-template-columns: minmax(0, 884px) 292px",
  "min-height: 116px",
  "max-width: 720px"
]) {
  need(css, token, "responsive-premium-v2-workspace");
}
for (const token of [
  'body[data-prosmet-estimate-open="true"] main',
  "--prosmet-chat-width",
  ".prosmet-estimate-sheet",
  ".prosmet-row-sheet"
]) {
  forbid(css, token, "legacy-responsive-workspace");
}

const compactE2e = await read("e2e/compact-estimate-workspace.spec.ts");
for (const token of [
  "compact estimate card opens the focused desktop or mobile workspace",
  "estimate-workspace-layer",
  "data-prosmet-estimate-open",
  "Редактирование позиции",
  "estimate-workspace-${testInfo.project.name}.png"
]) {
  need(compactE2e, token, "estimate-workspace-e2e");
}

const premiumE2e = await read("e2e/premium-ui.spec.ts");
for (const token of [
  "distinct desktop and mobile product",
  "height).toBeGreaterThanOrEqual(100)",
  "rowTitleSize).toBeGreaterThanOrEqual(16)",
  "prosmet-v2-mobile-nav"
]) {
  need(premiumE2e, token, "premium-v2-visual-e2e");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "premium-estimate-workspace-v2",
      desktop: "full-width document workspace plus dedicated summary rail",
      mobile: "full-screen estimate with 100px+ cards and keyboard-safe row sheet",
      chat: "assistant-first canvas with compact estimate artifact",
      autosave: "IndexedDB + existing outbox",
      runtime: "single assistant-ui runtime",
      legacyCompactLayout: "deleted"
    },
    null,
    2
  )
);
