import { describe, expect, it } from "vitest";
import { buildBrandedExcelHtml, exportBrand } from "./branded-export";
import { buildBrandedPdfDefinition } from "./branded-pdf";

const sample = {
  title: "Механизированная штукатурка стен",
  project: "Дом",
  customer: "Заказчик",
  region: "Татарстан",
  revision: 2,
  status: "review",
  sections: [
    {
      title: "Работы",
      items: [
        { name: "Штукатурка гипсовая", unit: "м²", quantity: 358, unitPrice: 500 }
      ]
    }
  ],
  totals: { direct: 179000, overhead: 0, profit: 0, vat: 0, total: 179000 }
};

describe("branded exports", () => {
  it("creates a Cyrillic PDFMake document definition", () => {
    const definition = buildBrandedPdfDefinition(sample) as {
      info?: { title?: string; author?: string };
      content?: unknown[];
      styles?: Record<string, unknown>;
    };
    expect(definition.info?.title).toBe(sample.title);
    expect(definition.info?.author).toBe("ProSmet");
    expect(definition.content?.length).toBeGreaterThan(4);
    expect(JSON.stringify(definition)).toContain("Штукатурка гипсовая");
    expect(JSON.stringify(definition)).toContain(exportBrand.blue);
  });

  it("creates a branded Excel-compatible workbook", () => {
    const html = buildBrandedExcelHtml(sample);
    expect(html).toContain("<table>");
    expect(html).toContain("Штукатурка гипсовая");
    expect(html).toContain(exportBrand.green);
    expect(html).toContain("179000");
  });
});
