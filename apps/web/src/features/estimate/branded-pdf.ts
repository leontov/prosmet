import { exportBrand, exportFileName } from "./branded-export";

type Item = { name?: string; unit?: string; quantity?: number; unitPrice?: number };
type EstimateLike = {
  title?: string;
  project?: string;
  customer?: string;
  region?: string;
  revision?: number;
  status?: string;
  sections?: Array<{ title?: string; items?: Item[] }>;
  totals?: { direct?: number; overhead?: number; profit?: number; vat?: number; total?: number };
};
type PdfDocument = {
  download: (filename: string) => void;
  getBlob: (callback: (blob: Blob) => void) => void;
};
type PdfMake = {
  vfs?: Record<string, string>;
  createPdf: (definition: unknown) => PdfDocument;
};
type PdfFonts = {
  vfs?: Record<string, string>;
  pdfMake?: { vfs?: Record<string, string> };
  [filename: string]: unknown;
};

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;

function normalized(value: unknown): EstimateLike {
  return value && typeof value === "object" ? value as EstimateLike : {};
}

function directFontVfs(value: PdfFonts): Record<string, string> | undefined {
  const entries = Object.entries(value).filter(
    ([name, content]) => name.endsWith(".ttf") && typeof content === "string"
  ) as Array<[string, string]>;
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function buildBrandedPdfDefinition(value: unknown) {
  const estimate = normalized(value);
  const lines = (estimate.sections || []).flatMap((section) =>
    (section.items || []).map((item) => ({
      section: section.title || "Работы и материалы",
      item,
      total: numeric(item.quantity) * numeric(item.unitPrice)
    }))
  );
  const direct = estimate.totals?.direct ?? lines.reduce((sum, line) => sum + line.total, 0);
  const overhead = estimate.totals?.overhead ?? 0;
  const profit = estimate.totals?.profit ?? 0;
  const vat = estimate.totals?.vat ?? 0;
  const total = estimate.totals?.total ?? direct + overhead + profit + vat;

  return {
    pageSize: "A4",
    pageMargins: [34, 38, 34, 34],
    info: { title: estimate.title || "Строительная смета", author: "ProSmet" },
    defaultStyle: { font: "Roboto", fontSize: 9, color: exportBrand.ink },
    content: [
      {
        canvas: [
          { type: "rect", x: 0, y: 0, w: 527, h: 7, r: 3.5, color: exportBrand.blue },
          { type: "rect", x: 302, y: 0, w: 225, h: 7, r: 3.5, color: exportBrand.green }
        ],
        margin: [0, 0, 0, 18]
      },
      {
        columns: [
          { width: "*", text: "ProSmet", color: exportBrand.blue, bold: true, fontSize: 20 },
          {
            width: 180,
            text: `Ревизия ${estimate.revision || 1}\nСтатус: ${estimate.status || "draft"}`,
            alignment: "right",
            color: exportBrand.muted,
            fontSize: 8
          }
        ]
      },
      { text: estimate.title || "Строительная смета", fontSize: 23, bold: true, margin: [0, 22, 0, 6] },
      {
        columns: [
          { text: `ПРОЕКТ\n${estimate.project || "Не указан"}`, style: "meta" },
          { text: `ЗАКАЗЧИК\n${estimate.customer || "Не указан"}`, style: "meta" },
          { text: `РЕГИОН\n${estimate.region || "Не указан"}`, style: "meta" }
        ],
        columnGap: 8,
        margin: [0, 8, 0, 20]
      },
      {
        table: {
          headerRows: 1,
          widths: ["*", 34, 48, 66, 72],
          body: [
            [
              { text: "Раздел / позиция", style: "head" },
              { text: "Ед.", style: "head", alignment: "center" },
              { text: "Кол-во", style: "head", alignment: "right" },
              { text: "Цена", style: "head", alignment: "right" },
              { text: "Сумма", style: "head", alignment: "right" }
            ],
            ...lines.map(({ section, item, total: lineTotal }) => [
              { stack: [{ text: section, color: exportBrand.blue, bold: true, fontSize: 8 }, { text: item.name || "Позиция", bold: true, margin: [0, 2, 0, 0] }] },
              { text: item.unit || "", alignment: "center" },
              { text: numeric(item.quantity).toLocaleString("ru-RU"), alignment: "right" },
              { text: money(numeric(item.unitPrice)), alignment: "right" },
              { text: money(lineTotal), alignment: "right", bold: true }
            ])
          ]
        },
        layout: {
          fillColor: (rowIndex: number) => rowIndex > 0 && rowIndex % 2 === 0 ? "#F8FBFF" : null,
          hLineColor: () => exportBrand.line,
          vLineColor: () => exportBrand.line,
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 6,
          paddingBottom: () => 6
        }
      },
      {
        columns: [
          {
            width: "*",
            text: "Документ создан в ProSmet. Перед передачей заказчику проверьте исходные данные и реквизиты сторон.",
            color: exportBrand.muted,
            fontSize: 8,
            margin: [0, 18, 22, 0]
          },
          {
            width: 210,
            table: {
              widths: ["*", 82],
              body: [
                ["Прямые затраты", { text: money(direct), alignment: "right" }],
                ["Накладные", { text: money(overhead), alignment: "right" }],
                ["Сметная прибыль", { text: money(profit), alignment: "right" }],
                ["НДС", { text: money(vat), alignment: "right" }],
                [{ text: "Итого", bold: true, color: "#FFFFFF", fillColor: exportBrand.green }, { text: money(total), bold: true, alignment: "right", color: "#FFFFFF", fillColor: exportBrand.green }]
              ]
            },
            layout: "lightHorizontalLines",
            margin: [0, 18, 0, 0]
          }
        ]
      }
    ],
    styles: {
      head: { fillColor: exportBrand.blue, color: "#FFFFFF", bold: true, fontSize: 8 },
      meta: { fillColor: exportBrand.soft, color: exportBrand.muted, fontSize: 8, lineHeight: 1.35, margin: [7, 8, 7, 8] }
    }
  };
}

async function loadPdfMake() {
  const [pdfMakeModule, fontsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts")
  ]);
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as unknown as PdfMake;
  const fonts = (fontsModule.default ?? fontsModule) as unknown as PdfFonts;
  const vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? directFontVfs(fonts) ?? pdfMake.vfs;
  if (!vfs) throw new Error("Не удалось загрузить шрифты PDF.");
  pdfMake.vfs = vfs;
  return pdfMake;
}

export async function createBrandedPdfBlob(value: unknown) {
  const pdfMake = await loadPdfMake();
  const document = pdfMake.createPdf(buildBrandedPdfDefinition(value));
  const blob = await new Promise<Blob>((resolve) => document.getBlob(resolve));
  const signature = new TextDecoder("ascii").decode(await blob.slice(0, 5).arrayBuffer());
  if (signature !== "%PDF-") throw new Error("Сформированный файл не является PDF.");
  return blob;
}

export async function downloadBrandedPdf(value: unknown) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(buildBrandedPdfDefinition(value)).download(exportFileName(value, "pdf"));

}
