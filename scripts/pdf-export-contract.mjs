import { readFile } from "node:fs/promises";

const [runtime, tsconfig, e2e] = await Promise.all([
  readFile("lib/exports/estimate-runtime.ts", "utf8"),
  readFile("tsconfig.json", "utf8"),
  readFile("e2e/on-site-estimator.spec.ts", "utf8")
]);

const failures = [];
const need = (source, token, scope) => {
  if (!source.includes(token)) failures.push(`${scope}:missing:${token}`);
};

for (const token of [
  "cloneEstimate(draft)",
  "createEstimatePdfBlobCore",
  "downloadBlobWithoutNavigating",
  "anchor.target = frameName",
  "URL.revokeObjectURL(objectUrl)"
]) {
  need(runtime, token, "pdf-export-runtime");
}

need(
  tsconfig,
  '"@/lib/exports/estimate": ["./lib/exports/estimate-runtime.ts"]',
  "pdf-export-alias"
);
for (const token of [
  'page.waitForEvent("download")',
  "expect(page.url()).toBe(applicationUrl)",
  "await expect(preview).toBeVisible()"
]) {
  need(e2e, token, "pdf-export-e2e");
}

if (failures.length) {
  console.error("PDF EXPORT CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PDF EXPORT CONTRACT PASS");
