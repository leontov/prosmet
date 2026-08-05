type EstimateItemLike = {
  name?: string;
  unit?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

type EstimateLike = {
  title?: string;
  project?: string;
  customer?: string;
  region?: string;
  revision?: number | string;
  status?: string;
  sections?: Array<{ title?: string; items?: EstimateItemLike[] }>;
  totals?: { direct?: number; overhead?: number; profit?: number; vat?: number; total?: number };
};

type ZipEntry = { name: string; data: Uint8Array };

const encoder = new TextEncoder();
const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function estimateValue(value: unknown): EstimateLike {
  return value && typeof value === "object" ? value as EstimateLike : {};
}

function xml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeStem(value: unknown) {
  return String(value || "smeta")
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "smeta";
}

function inlineCell(reference: string, value: unknown, style: number) {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(reference: string, value: unknown, style: number) {
  return `<c r="${reference}" s="${style}"><v>${numberValue(value)}</v></c>`;
}

function row(index: number, cells: string[], height?: number) {
  return `<row r="${index}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;
}

function workbookRows(estimate: EstimateLike) {
  const lines: string[] = [];
  const merges = ["A1:F1", "B2:C2", "E2:F2", "B3:C3", "E3:F3"];
  let index = 1;

  lines.push(row(index++, [inlineCell("A1", `ProSmet — ${estimate.title || "Строительная смета"}`, 1)], 30));
  lines.push(row(index++, [
    inlineCell("A2", "Проект", 2),
    inlineCell("B2", estimate.project || "Не указан", 3),
    inlineCell("D2", "Регион", 2),
    inlineCell("E2", estimate.region || "Не указан", 3)
  ], 22));
  lines.push(row(index++, [
    inlineCell("A3", "Заказчик", 2),
    inlineCell("B3", estimate.customer || "Не указан", 3),
    inlineCell("D3", "Ревизия / статус", 2),
    inlineCell("E3", `${estimate.revision || 1} / ${estimate.status || "draft"}`, 3)
  ], 22));
  lines.push(row(index++, []));
  const headerRow = index;
  lines.push(row(index++, [
    inlineCell(`A${headerRow}`, "Раздел", 4),
    inlineCell(`B${headerRow}`, "Наименование", 4),
    inlineCell(`C${headerRow}`, "Ед.", 4),
    inlineCell(`D${headerRow}`, "Количество", 4),
    inlineCell(`E${headerRow}`, "Цена", 4),
    inlineCell(`F${headerRow}`, "Сумма", 4)
  ], 24));

  let calculatedDirect = 0;
  for (const section of estimate.sections || []) {
    const sectionRow = index++;
    merges.push(`A${sectionRow}:F${sectionRow}`);
    lines.push(row(sectionRow, [inlineCell(`A${sectionRow}`, section.title || "Работы и материалы", 5)], 22));
    for (const item of section.items || []) {
      const itemRow = index++;
      const lineTotal = numberValue(item.quantity) * numberValue(item.unitPrice);
      calculatedDirect += lineTotal;
      lines.push(row(itemRow, [
        inlineCell(`A${itemRow}`, section.title || "", 6),
        inlineCell(`B${itemRow}`, item.name || "Позиция", 6),
        inlineCell(`C${itemRow}`, item.unit || "", 6),
        numberCell(`D${itemRow}`, item.quantity, 7),
        numberCell(`E${itemRow}`, item.unitPrice, 8),
        numberCell(`F${itemRow}`, lineTotal, 8)
      ], 21));
    }
  }

  const direct = estimate.totals?.direct ?? calculatedDirect;
  const overhead = estimate.totals?.overhead ?? 0;
  const profit = estimate.totals?.profit ?? 0;
  const vat = estimate.totals?.vat ?? 0;
  const total = estimate.totals?.total ?? direct + overhead + profit + vat;
  const totals = [
    ["Прямые затраты", direct],
    ["Накладные расходы", overhead],
    ["Сметная прибыль", profit],
    ["НДС", vat]
  ] as const;
  for (const [label, value] of totals) {
    const totalRow = index++;
    merges.push(`A${totalRow}:E${totalRow}`);
    lines.push(row(totalRow, [inlineCell(`A${totalRow}`, label, 2), numberCell(`F${totalRow}`, value, 8)], 21));
  }
  const grandRow = index++;
  merges.push(`A${grandRow}:E${grandRow}`);
  lines.push(row(grandRow, [inlineCell(`A${grandRow}`, "Итого", 9), numberCell(`F${grandRow}`, total, 10)], 26));

  return {
    xml: lines.join(""),
    merges,
    headerRow,
    lastRow: grandRow,
    lastDataRow: Math.max(headerRow, grandRow - totals.length - 1)
  };
}

function buildSheet(estimate: EstimateLike) {
  const rows = workbookRows(estimate);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
  <dimension ref="A1:F${rows.lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="${rows.headerRow}" topLeftCell="A${rows.headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/>
    <col min="2" max="2" width="48" customWidth="1"/>
    <col min="3" max="3" width="10" customWidth="1"/>
    <col min="4" max="4" width="14" customWidth="1"/>
    <col min="5" max="6" width="17" customWidth="1"/>
  </cols>
  <sheetData>${rows.xml}</sheetData>
  <autoFilter ref="A${rows.headerRow}:F${rows.lastDataRow}"/>
  <mergeCells count="${rows.merges.length}">${rows.merges.map((reference) => `<mergeCell ref="${reference}"/>`).join("")}</mergeCells>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>
</worksheet>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="# ##0 &quot;₽&quot;"/></numFmts>
  <fonts count="4">
    <font><sz val="11"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font>
    <font><b/><color rgb="FF1267E5"/><sz val="11"/><name val="Aptos"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Aptos Display"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0D0F12"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1267E5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF107C55"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFDDE6F2"/></left><right style="thin"><color rgb="FFDDE6F2"/></right><top style="thin"><color rgb="FFDDE6F2"/></top><bottom style="thin"><color rgb="FFDDE6F2"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="1" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function concatenate(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function zip(entries: ZipEntry[]) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  const timestamp = dosTimestamp();
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const local = new Uint8Array(30 + name.byteLength);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, timestamp.time, true);
    localView.setUint16(12, timestamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.byteLength, true);
    localView.setUint32(22, entry.data.byteLength, true);
    localView.setUint16(26, name.byteLength, true);
    local.set(name, 30);
    localChunks.push(local, entry.data);

    const central = new Uint8Array(46 + name.byteLength);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, timestamp.time, true);
    centralView.setUint16(14, timestamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.byteLength, true);
    centralView.setUint32(24, entry.data.byteLength, true);
    centralView.setUint16(28, name.byteLength, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.byteLength + entry.data.byteLength;
  }

  const centralDirectory = concatenate(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectory.byteLength, true);
  endView.setUint32(16, offset, true);
  return concatenate([...localChunks, centralDirectory, end]);
}

function textEntry(name: string, value: string): ZipEntry {
  return { name, data: encoder.encode(value) };
}

export function buildBrandedXlsxBytes(value: unknown) {
  const estimate = estimateValue(value);
  const created = new Date().toISOString();
  const entries: ZipEntry[] = [
    textEntry("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    textEntry("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    textEntry("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>ProSmet</Application><AppVersion>1.0</AppVersion></Properties>`),
    textEntry("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(estimate.title || "Строительная смета")}</dc:title><dc:creator>ProSmet</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`),
    textEntry("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews><sheets><sheet name="Смета" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`),
    textEntry("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    textEntry("xl/styles.xml", stylesXml),
    textEntry("xl/worksheets/sheet1.xml", buildSheet(estimate))
  ];
  return zip(entries);
}

export function brandedXlsxFileName(value: unknown) {
  const estimate = estimateValue(value);
  return `prosmet-${safeStem(estimate.title || estimate.project)}.xlsx`;
}

export function downloadBrandedXlsx(value: unknown) {
  const bytes = buildBrandedXlsxBytes(value);
  const blob = new Blob([bytes], { type: xlsxMime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = brandedXlsxFileName(value);
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
