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
  "components/app/prosmet-application.tsx",
  "components/app/estimate-workspace-editor.tsx",
  "app/estimate-workspace.css",
  "e2e/compact-estimate-workspace.spec.ts"
];

for (const path of required) {
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`missing:${path}`);
  }
}

const application = await read("components/app/prosmet-application.tsx");
for (const token of [
  "ChatWorkspace",
  "EstimateWorkspaceEditor",
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
  need(application, token, "compact-estimate-application");
}
for (const token of ["AssistantRuntimeProvider", "useAgUiRuntime", "useLocalRuntime"]) {
  forbid(application, token, "single-chat-runtime");
}

const editor = await read("components/app/estimate-workspace-editor.tsx");
for (const token of [
  'data-testid="estimate-workspace-layer"',
  'data-testid="estimate-document-overlay"',
  'data-testid="estimate-document-canvas"',
  'data-testid="estimate-revision-preview"',
  'aria-label="Редактирование позиции"',
  "Автосохранено",
  "Добавить позицию",
  "Добавить раздел",
  "Технология и подробности расчёта",
  "Скачать PDF",
  "Скачать Excel",
  "Поделиться"
]) {
  need(editor, token, "compact-estimate-editor");
}

const css = await read("app/estimate-workspace.css");
for (const token of [
  '[data-prosmet-supporting-artifact="true"]',
  ".prosmet-estimate-sheet",
  ".prosmet-row-sheet",
  'body[data-prosmet-estimate-open="true"] main',
  "--prosmet-chat-width",
  "--prosmet-sidebar-width"
]) {
  need(css, token, "responsive-estimate-workspace");
}

const e2e = await read("e2e/compact-estimate-workspace.spec.ts");
for (const token of [
  "compact estimate card opens the focused desktop or mobile workspace",
  "estimate-workspace-layer",
  "data-prosmet-estimate-open",
  "Редактирование позиции",
  "Автосохранено",
  "estimate-workspace-${testInfo.project.name}.png"
]) {
  need(e2e, token, "compact-estimate-e2e");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "compact-estimate-workspace-v1",
      desktop: "sidebar + estimate document + narrow chat",
      mobile: "estimate sheet + row bottom sheet",
      chat: "compact card only; supporting artifacts remain hidden but persisted",
      autosave: "IndexedDB + existing outbox",
      runtime: "single assistant-ui runtime"
    },
    null,
    2
  )
);
