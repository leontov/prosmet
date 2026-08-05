from pathlib import Path

path = Path("apps/web/e2e/app.spec.ts")
source = path.read_text(encoding="utf-8")

old_import = 'import { mkdir, writeFile } from "node:fs/promises";'
new_import = 'import { mkdir, readFile, stat, writeFile } from "node:fs/promises";'
if source.count(old_import) != 1:
    raise SystemExit("app.spec fs import marker missing")
source = source.replace(old_import, new_import, 1)

marker = '''  const saveResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/estimates/${encodeURIComponent(artifact.id)}` &&
    response.request().method() === "PUT"
  );'''
insert = '''  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await editor.getByRole("button", { name: "Скачать PDF" }).first().click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toMatch(/\\.pdf$/);
  const pdfPath = await pdfDownload.path();
  if (pdfPath) {
    expect((await stat(pdfPath)).size).toBeGreaterThan(5_000);
    expect((await readFile(pdfPath)).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }

  const excelDownloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await editor.getByRole("button", { name: "Скачать Excel" }).first().click();
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toMatch(/\\.xls$/);
  const excelPath = await excelDownload.path();
  if (excelPath) {
    const excelBytes = await readFile(excelPath);
    expect(excelBytes.length).toBeGreaterThan(1_000);
    expect(excelBytes.toString("utf8")).toContain("ProSmet");
  }

''' + marker
if source.count(marker) != 1:
    raise SystemExit("app.spec save marker missing")
source = source.replace(marker, insert, 1)
path.write_text(source, encoding="utf-8")
