from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one target, found {count}")
    path.write_text(source.replace(old, new, 1), encoding="utf-8")


contract = Path("scripts/greenfield-contract.mjs")
replace_once(
    contract,
    '''const webApp = await read("apps/web/src/app/App.tsx");
const webRuntime = await read("apps/web/src/runtime/RuntimeProvider.tsx");''',
    '''const webApp = await read("apps/web/src/app/App.tsx");
const professionalApp = await read("apps/web/src/app/ProfessionalApp.tsx");
const brandedXlsx = await read("apps/web/src/features/estimate/branded-xlsx.ts");
const webRuntime = await read("apps/web/src/runtime/RuntimeProvider.tsx");''',
)
replace_once(
    contract,
    '''if (!webEstimate.includes("downloadExcel") || !webEstimate.includes("printEstimate") || !webEstimate.includes("navigator.share")) failures.push("estimate:working-export-or-share-missing");''',
    '''if (!webEstimate.includes("createBrandedPdfBlob") || !webEstimate.includes("downloadBrandedXlsx") || !webEstimate.includes("navigator.share")) failures.push("estimate:working-export-or-share-missing");''',
)
replace_once(
    contract,
    '''if (!webEstimate.includes("downloadBrandedPdf") || !webEstimate.includes("buildBrandedExcelHtml")) failures.push("exports:branded-pdf-excel-missing");''',
    '''if (!webEstimate.includes("createBrandedPdfBlob") || !webEstimate.includes("downloadBrandedXlsx")) failures.push("exports:branded-pdf-excel-missing");''',
)
replace_once(
    contract,
    '''for (const token of ["buildBrandedXlsxBytes", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"]) {
  if (!allSource.includes(token)) failures.push(`exports:xlsx-contract-missing:${token}`);
}''',
    '''for (const token of ["buildBrandedXlsxBytes", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"]) {
  if (!brandedXlsx.includes(token)) failures.push(`exports:xlsx-contract-missing:${token}`);
}''',
)
