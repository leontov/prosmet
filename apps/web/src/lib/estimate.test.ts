import { describe, expect, it } from "vitest";
import type { Estimate } from "@prosmet/contracts";
import { calculateEstimate, calculateMaterialRequirement } from "./estimate";

const estimate: Estimate = {
  id: "e1",
  title: "Тест",
  project: "Объект",
  customer: "Клиент",
  region: "Казань",
  revision: 1,
  status: "draft",
  overheadPercent: 5,
  profitPercent: 10,
  vatPercent: 20,
  updatedAt: "2026-07-31T00:00:00.000Z",
  sections: [{
    id: "s1",
    title: "Работы",
    items: [{ id: "i1", name: "Работа", unit: "м²", quantity: 10, unitPrice: 100, category: "work" }]
  }]
};

describe("calculateEstimate", () => {
  it("calculates markups in deterministic order", () => {
    const result = calculateEstimate(estimate);
    expect(result.direct).toBe(1000);
    expect(result.overhead).toBe(50);
    expect(result.profit).toBe(105);
    expect(result.vat).toBe(231);
    expect(result.total).toBe(1386);
  });

  it("matches fixed-point rounding at quantity and price boundaries", () => {
    const result = calculateEstimate({
      ...estimate,
      overheadPercent: 0,
      profitPercent: 0,
      vatPercent: 0,
      sections: [{
        ...estimate.sections[0]!,
        items: [{
          ...estimate.sections[0]!.items[0]!,
          quantity: 1.001,
          unitPrice: 19.99
        }]
      }]
    });
    expect(result.itemTotals.i1).toBe(20.01);
    expect(result.total).toBe(20.01);
  });

  it("does not allow negative line totals", () => {
    const result = calculateEstimate({
      ...estimate,
      sections: [{ ...estimate.sections[0]!, items: [{ ...estimate.sections[0]!.items[0]!, quantity: -5 }] }]
    });
    expect(result.direct).toBe(0);
  });
});

describe("calculateMaterialRequirement", () => {
  it("calculates packaged material with waste", () => {
    const result = calculateMaterialRequirement(180, 10, 10, 30);
    expect(result.netKg).toBe(1800);
    expect(result.requiredKg).toBe(1980);
    expect(result.packages).toBe(66);
    expect(result.purchasedKg).toBe(1980);
  });

  it("rounds the package count upward", () => {
    const result = calculateMaterialRequirement(50, 10, 10, 30);
    expect(result.requiredKg).toBe(550);
    expect(result.packages).toBe(19);
    expect(result.purchasedKg).toBe(570);
  });

  it("rejects a zero package size", () => {
    expect(() => calculateMaterialRequirement(10, 10, 10, 0)).toThrow("packageKg must be positive");
  });
});
