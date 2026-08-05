import { describe, expect, it } from "vitest";
import { brandedXlsxFileName, buildBrandedXlsxBytes } from "./branded-xlsx";

const estimate = {
  title: "Ремонт ванной комнаты",
  project: "Квартира",
  customer: "Иванов И.И.",
  region: "Республика Татарстан",
  revision: 3,
  status: "review",
  sections: [
    {
      title: "Работы",
      items: [
        { name: "Гидроизоляция пола", unit: "м²", quantity: 6.5, unitPrice: 850 },
        { name: "Укладка плитки", unit: "м²", quantity: 24, unitPrice: 1900 }
      ]
    }
  ],
  totals: { direct: 51125, overhead: 0, profit: 0, vat: 0, total: 51125 }
};

describe("branded XLSX export", () => {
  it("creates a valid ZIP-based OpenXML workbook with branded content", () => {
    const bytes = buildBrandedXlsxBytes(estimate);
    expect(String.fromCharCode(...bytes.subarray(0, 2))).toBe("PK");
    const payload = new TextDecoder().decode(bytes);
    expect(payload).toContain("[Content_Types].xml");
    expect(payload).toContain("xl/worksheets/sheet1.xml");
    expect(payload).toContain("Ремонт ванной комнаты");
    expect(payload).toContain("Гидроизоляция пола");
    expect(payload).toContain("FF1267E5");
    expect(bytes.byteLength).toBeGreaterThan(5_000);
  });

  it("uses the real xlsx extension", () => {
    expect(brandedXlsxFileName(estimate)).toMatch(/^prosmet-.+\.xlsx$/);
  });
});
