import { describe, expect, it } from "vitest";
import type { Estimate } from "@prosmet/contracts";
import { calculateEstimate } from "./estimate";

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

  it("does not allow negative line totals", () => {
    const result = calculateEstimate({
      ...estimate,
      sections: [{ ...estimate.sections[0]!, items: [{ ...estimate.sections[0]!.items[0]!, quantity: -5 }] }]
    });
    expect(result.direct).toBe(0);
  });
});
