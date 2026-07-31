import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { calculateEstimate, type EstimateDraft } from "@/lib/domain/estimate";

type PdfKitDocument = {
  on: {
    (event: "data", listener: (chunk: Buffer) => void): PdfKitDocument;
    (event: "end", listener: () => void): PdfKitDocument;
    (event: "error", listener: (error: Error) => void): PdfKitDocument;
  };
  end: () => void;
};

type PdfPrinterInstance = {
  createPdfKitDocument: (definition: TDocumentDefinitions) => PdfKitDocument;
};

type PdfPrinterConstructor = new (fonts: Record<string, unknown>) => PdfPrinterInstance;

const require = createRequire(import.meta.url);
const PdfPrinter = require("pdfmake") as PdfPrinterConstructor;

function safeName(value: string) {
  return value
    .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "prosmet-estimate";
}

type VirtualFileSystem = Record<string, string>;

function isVirtualFileSystem(value: unknown): value is VirtualFileSystem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length > 0 && entries.every(([, content]) => typeof content === "string");
}

function extractVirtualFileSystem(moduleValue: unknown) {
  const module = moduleValue as { default?: unknown; pdfMake?: { vfs?: unknown }; vfs?: unknown };
  const defaultValue = module.default as { pdfMake?: { vfs?: unknown }; vfs?: unknown } | undefined;
  return [module.default, module, module.pdfMake?.vfs, module.vfs, defaultValue?.pdfMake?.vfs, defaultValue?.vfs]
    .find(isVirtualFileSystem) ?? null;
}

function pdfDefinition(draft: EstimateDraft): TDocumentDefinitions {
  const calculation = calculateEstimate(draft);
  const body: any[][] = [[
    { text: "№", bold: true },
    { text: "Код", bold: true },
    { text: "Наименование", bold: true },
    { text: "Ед.", bold: true },
    { text: "Кол-во", bold: true },
    { text: "Цена", bold: true },
    { text: "Сумма", bold: true }
  ]];

  let index = 1;
  for (const section of draft.sections) {
    body.push([{ text: section.title, bold: true, colSpan: 7, fillColor: "#f1f1f1" }, {}, {}, {}, {}, {}, {}]);
    for (const item of section.items) {
      body.push([
        index++, item.code, item.name, item.unit, item.quantity,
        { text: item.unitPrice.toFixed(2), alignment: "right" },
        { text: (calculation.itemAmounts[item.id] ?? 0).toFixed(2), alignment: "right" }
      ]);
    }
  }

  const content: Content[] = [
    { text: draft.title, fontSize: 15, bold: true, alignment: "center", margin: [0, 0, 0, 12] },
    {
      columns: [
        [
{ text: `Объект: ${draft.objectName || "—"}` },
{ text: `Заказчик: ${draft.customer || "—"}` },
{ text: `Подрядчик: ${draft.contractor || "—"}` },
{ text: `Регион: ${draft.region || "—"}` },
{ text: `Метод: ${draft.method}` }
        ],
        [
{ text: `Дата: ${draft.date}`, alignment: "right" },
{ text: `Версия: ${draft.revision}`, alignment: "right" },
{ text: `Статус: ${draft.status}`, alignment: "right" }
        ]
      ],
      margin: [0, 0, 0, 10]
    },
    {
      table: { headerRows: 1, widths: [18, 45, "*", 28, 42, 48, 52], body },
      layout: {
        fillColor: (rowIndex: number) => rowIndex === 0 ? "#e8e8e8" : null,
        hLineColor: () => "#b8b8b8",
        vLineColor: () => "#b8b8b8"
      }
    },
    {
      margin: [0, 12, 0, 0],
      alignment: "right",
      stack: [
        { text: `Прямые затраты: ${calculation.directCost.toFixed(2)} ${draft.currency}` },
        { text: `Накладные: ${calculation.overhead.toFixed(2)} ${draft.currency}` },
        { text: `Прибыль: ${calculation.profit.toFixed(2)} ${draft.currency}` },
        { text: `Скидка: ${calculation.discount.toFixed(2)} ${draft.currency}` },
        { text: `НДС: ${calculation.vat.toFixed(2)} ${draft.currency}` },
        { text: `ИТОГО: ${calculation.total.toFixed(2)} ${draft.currency}`, bold: true, fontSize: 11, margin: [0, 4, 0, 0] }
      ]
    }
  ];

  if (draft.assumptions.length) content.push({ text: "Допущения", bold: true, margin: [0, 14, 0, 4] }, { ul: draft.assumptions });
  if (draft.warnings.length) content.push({ text: "Предупреждения", bold: true, margin: [0, 12, 0, 4] }, { ul: draft.warnings });

  return {
    pageSize: "A4",
    pageMargins: [28, 32, 28, 32],
    defaultStyle: { font: "Roboto", fontSize: 8 },
    info: {
      title: draft.title,
      author: draft.contractor || "Просметчик",
      subject: draft.objectName || "Строительная смета",
      creator: "Просметчик"
    },
    content
  };
}

async function fontDictionary() {
  const moduleValue = await import("pdfmake/build/vfs_fonts");
  const vfs = extractVirtualFileSystem(moduleValue);
  if (!vfs) throw new Error("Встроенные шрифты PDF не загрузились");
  const font = (name: string) => {
    const value = vfs[name];
    if (!value) throw new Error(`Шрифт ${name} отсутствует`);
    return Buffer.from(value, "base64");
  };
  return {
    Roboto: {
      normal: font("Roboto-Regular.ttf"),
      bold: font("Roboto-Medium.ttf"),
      italics: font("Roboto-Italic.ttf"),
      bolditalics: font("Roboto-MediumItalic.ttf")
    }
  };
}

export async function createEstimatePdfBuffer(draft: EstimateDraft) {
  const printer = new PdfPrinter(await fontDictionary() as any);
  const document = printer.createPdfKitDocument(pdfDefinition(draft));
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
    document.end();
  });
}

export async function createEstimateXlsxBuffer(draft: EstimateDraft) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Просметчик";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Смета", { views: [{ state: "frozen", ySplit: 6 }] });
  const calculation = calculateEstimate(draft);

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = draft.title;
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = { horizontal: "center" };
  sheet.getCell("A3").value = "Объект";
  sheet.getCell("B3").value = draft.objectName;
  sheet.getCell("A4").value = "Регион";
  sheet.getCell("B4").value = draft.region;
  sheet.getCell("D3").value = "Метод";
  sheet.getCell("E3").value = draft.method;
  sheet.getCell("D4").value = "Версия";
  sheet.getCell("E4").value = draft.revision;

  const header = sheet.addRow(["№", "Код", "Наименование", "Тип ресурса", "Ед.", "Количество", "Норма", "Коэффициент", "Цена", "Сумма"]);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E7E7" } };

  let position = 1;
  for (const section of draft.sections) {
    const sectionRow = sheet.addRow([section.title]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, 10);
    sectionRow.font = { bold: true };
    sectionRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    for (const item of section.items) {
      const row = sheet.addRow([
        position++, item.code, item.name, item.resourceType, item.unit,
        item.quantity, item.norm, item.coefficient, item.unitPrice,
        calculation.itemAmounts[item.id] ?? 0
      ]);
      row.getCell(9).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";
    }
  }

  sheet.addRow([]);
  for (const [label, value] of [
    ["Прямые затраты", calculation.directCost],
    ["Накладные", calculation.overhead],
    ["Прибыль", calculation.profit],
    ["Скидка", -calculation.discount],
    ["НДС", calculation.vat],
    ["Итого", calculation.total]
  ] as const) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: label === "Итого" };
    row.getCell(2).font = { bold: label === "Итого" };
    row.getCell(2).numFmt = "#,##0.00";
  }

  sheet.columns = [
    { width: 7 }, { width: 16 }, { width: 42 }, { width: 16 }, { width: 10 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 16 }
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function estimateExportFilename(draft: EstimateDraft, format: "pdf" | "xlsx") {
  return `${safeName(draft.title)}-v${draft.revision}.${format}`;
}
