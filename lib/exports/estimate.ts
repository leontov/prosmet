"use client";

import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { calculateEstimate, type EstimateDraft } from "@/lib/domain/estimate";

function safeName(value: string) {
  return (
    value
      .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "prosmet-estimate"
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function estimatePdfFilename(draft: EstimateDraft) {
  return `${safeName(draft.title)}-v${draft.revision}.pdf`;
}

export async function createEstimatePdfBlob(draft: EstimateDraft) {
  const [{ default: pdfMake }, fonts] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  const fontSource = fonts as unknown as {
    default?: unknown;
    pdfMake?: { vfs?: Record<string, string> };
  };
  const defaultValue = fontSource.default as
    | { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> }
    | undefined;
  const vfs = fontSource.pdfMake?.vfs ?? defaultValue?.pdfMake?.vfs ?? defaultValue?.vfs;
  if (vfs) (pdfMake as unknown as { vfs: Record<string, string> }).vfs = vfs;

  const calculation = calculateEstimate(draft);
  const body: any[][] = [
    [
      { text: "№", bold: true },
      { text: "Код", bold: true },
      { text: "Наименование", bold: true },
      { text: "Ед.", bold: true },
      { text: "Кол-во", bold: true },
      { text: "Цена", bold: true },
      { text: "Сумма", bold: true }
    ]
  ];

  let index = 1;
  for (const section of draft.sections) {
    body.push([
      { text: section.title, bold: true, colSpan: 7, fillColor: "#f1f1f1" },
      {},
      {},
      {},
      {},
      {},
      {}
    ]);
    for (const item of section.items) {
      body.push([
        index++,
        item.code,
        item.name,
        item.unit,
        item.quantity,
        { text: item.unitPrice.toFixed(2), alignment: "right" },
        {
          text: (calculation.itemAmounts[item.id] ?? 0).toFixed(2),
          alignment: "right"
        }
      ]);
    }
  }

  const projectDetails: Content[] = [
    { text: `Объект: ${draft.objectName || "—"}` },
    { text: `Заказчик: ${draft.customer || "—"}` },
    { text: `Подрядчик: ${draft.contractor || "—"}` },
    { text: `Регион: ${draft.region || "—"}` },
    { text: `Метод: ${draft.method}` }
  ];

  const content: Content[] = [
    {
      text: draft.title,
      fontSize: 15,
      bold: true,
      alignment: "center",
      margin: [0, 0, 0, 12]
    },
    {
      columns: [
        projectDetails,
        [
          { text: `Дата: ${draft.date}`, alignment: "right" },
          { text: `Версия: ${draft.revision}`, alignment: "right" },
          { text: `Статус: ${draft.status}`, alignment: "right" }
        ]
      ],
      margin: [0, 0, 0, 10]
    },
    {
      table: {
        headerRows: 1,
        widths: [18, 45, "*", 28, 42, 48, 52],
        body
      },
      layout: {
        fillColor: (rowIndex: number) => (rowIndex === 0 ? "#e8e8e8" : null),
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
        {
          text: `ИТОГО: ${calculation.total.toFixed(2)} ${draft.currency}`,
          bold: true,
          fontSize: 11,
          margin: [0, 4, 0, 0]
        }
      ]
    }
  ];

  if (draft.assumptions.length) {
    content.push(
      { text: "Допущения", bold: true, margin: [0, 14, 0, 4] },
      { ul: draft.assumptions }
    );
  }
  if (draft.warnings.length) {
    content.push(
      { text: "Предупреждения", bold: true, margin: [0, 12, 0, 4] },
      { ul: draft.warnings }
    );
  }

  const definition: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [28, 32, 28, 32],
    defaultStyle: { fontSize: 8 },
    content
  };

  // pdfmake 0.2.x exposes getBlob through a completion callback. Treating it
  // as a promise leaves the export action pending forever and the browser never
  // receives a download. Wrap the stable callback API and add a bounded timeout
  // so a malformed document cannot freeze the workspace indefinitely.
  const pdfDocument = pdfMake.createPdf(definition) as unknown as {
    getBlob: (callback: (blob: Blob) => void) => void;
  };
  return await new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("PDF не был сформирован за отведённое время"));
    }, 30_000);

    try {
      pdfDocument.getBlob((blob) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(blob);
      });
    } catch (error) {
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });
}

export async function exportEstimatePdf(draft: EstimateDraft) {
  const blob = await createEstimatePdfBlob(draft);
  saveBlob(blob, estimatePdfFilename(draft));
}

export async function exportEstimateXlsx(draft: EstimateDraft) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Просметчик";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Смета", {
    views: [{ state: "frozen", ySplit: 6 }]
  });
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

  const header = sheet.addRow([
    "№",
    "Код",
    "Наименование",
    "Тип ресурса",
    "Ед.",
    "Количество",
    "Норма",
    "Коэффициент",
    "Цена",
    "Сумма"
  ]);
  header.font = { bold: true };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE7E7E7" }
  };

  let position = 1;
  for (const section of draft.sections) {
    const sectionRow = sheet.addRow([section.title]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, 10);
    sectionRow.font = { bold: true };
    sectionRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" }
    };
    for (const item of section.items) {
      const row = sheet.addRow([
        position++,
        item.code,
        item.name,
        item.resourceType,
        item.unit,
        item.quantity,
        item.norm,
        item.coefficient,
        item.unitPrice,
        calculation.itemAmounts[item.id] ?? 0
      ]);
      row.getCell(9).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";
    }
  }

  sheet.addRow([]);
  const totals = [
    ["Прямые затраты", calculation.directCost],
    ["Накладные", calculation.overhead],
    ["Прибыль", calculation.profit],
    ["Скидка", -calculation.discount],
    ["НДС", calculation.vat],
    ["ИТОГО", calculation.total]
  ] as const;
  for (const [label, value] of totals) {
    const row = sheet.addRow(["", "", "", "", "", "", "", label, "", value]);
    row.getCell(8).font = { bold: label === "ИТОГО" };
    row.getCell(10).font = { bold: label === "ИТОГО" };
    row.getCell(10).numFmt = "#,##0.00";
  }

  sheet.columns = [
    { width: 7 },
    { width: 16 },
    { width: 48 },
    { width: 18 },
    { width: 10 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 15 },
    { width: 17 }
  ];
  sheet.eachRow((row) => {
    row.alignment = { vertical: "middle", wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer as ArrayBuffer);
  saveBlob(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }),
    `${safeName(draft.title)}-v${draft.revision}.xlsx`
  );
}