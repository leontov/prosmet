import { readFile } from "node:fs/promises";

const [runtime, server, route, tsconfig, e2e] = await Promise.all([
  readFile("lib/exports/estimate-runtime.ts", "utf8"),
  readFile("lib/server/exports/estimate.ts", "utf8"),
  readFile("app/api/export/estimate/route.ts", "utf8"),
  readFile("tsconfig.json", "utf8"),
  readFile("e2e/on-site-estimator.spec.ts", "utf8")
]);
const failures = [];
const need = (source, token, scope) => { if (!source.includes(token)) failures.push(`${scope}:missing:${token}`); };
const forbid = (source, token, scope) => { if (source.includes(token)) failures.push(`${scope}:forbidden:${token}`); };

for (const token of ["cloneEstimate(draft)", "/api/export/estimate?format=", "createEstimatePdfBlob", "downloadBlobWithoutNavigating", "anchor.target = frameName", "URL.revokeObjectURL(objectUrl)"]) need(runtime, token, "pdf-export-runtime");
for (const token of ["pdfmake", "exceljs", "Function(", "new Function"]) forbid(runtime, token, "client-export-runtime");
for (const token of ["PdfPrinter", "createPdfKitDocument", "createEstimatePdfBuffer", "createEstimateXlsxBuffer", "workbook.xlsx.writeBuffer"]) need(server, token, "server-export-engine");
for (const token of ["EstimateDraftSchema.safeParse", 'runtime = "nodejs"', 'format !== "pdf" && format !== "xlsx"', "content-disposition", "no-store"]) need(route, token, "export-route");
need(tsconfig, '"@/lib/exports/estimate": ["./lib/exports/estimate-runtime.ts"]', "pdf-export-alias");
for (const token of ['page.waitForEvent("download")', "expect(page.url()).toBe(applicationUrl)", "await expect(preview).toBeVisible()"] ) need(e2e, token, "pdf-export-e2e");

if (failures.length) {
  console.error("PDF EXPORT CONTRACT FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PDF EXPORT CONTRACT PASS");
