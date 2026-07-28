import { describe, expect, it } from "vitest";
import { calculateEstimate, validateForApproval, type EstimateDraft } from "./estimate";

function draft(): EstimateDraft {
  return {
    id: "estimate-test",
    title: "Тестовая смета",
    objectName: "Объект",
    customer: "",
    contractor: "",
    region: "Лениногорск",
    date: "2026-07-28",
    method: "commercial",
    currency: "RUB",
    status: "draft",
    revision: 1,
    technology: [
      {
        id: "step-1",
        title: "Подготовка",
        description: "",
        control: "",
        resources: []
      }
    ],
    sections: [
      {
        id: "section-1",
        title: "Работы",
        items: [
          {
            id: "item-1",
            code: "",
            name: "Работа",
            unit: "м²",
            quantity: 100,
            norm: 1,
            coefficient: 1,
            unitPrice: 500,
            resourceType: "work",
            source: {
              label: "Личная цена",
              kind: "personal",
              region: "Лениногорск",
              date: "2026-07-28",
              currency: "RUB",
              vatIncluded: false,
              deliveryIncluded: false,
              confidence: 100,
              confirmed: true
            },
            comment: "",
            warning: ""
          }
        ]
      }
    ],
    overheadPercent: 10,
    profitPercent: 5,
    discountPercent: 2,
    vatPercent: 20,
    assumptions: [],
    warnings: [],
    reviewerNotes: [],
    updatedAt: "2026-07-28T00:00:00.000Z"
  };
}

describe("deterministic estimate engine", () => {
  it("calculates totals in a stable order", () => {
    const result = calculateEstimate(draft());
    expect(result.directCost).toBe(50_000);
    expect(result.overhead).toBe(5_000);
    expect(result.profit).toBe(2_750);
    expect(result.discount).toBe(1_155);
    expect(result.subtotal).toBe(56_595);
    expect(result.vat).toBe(11_319);
    expect(result.total).toBe(67_914);
  });

  it("allows approval only when technology, quantity, price and source are complete", () => {
    expect(validateForApproval(draft()).canApprove).toBe(true);
    const incomplete = draft();
    incomplete.technology = [];
    incomplete.sections[0].items[0].unitPrice = 0;
    incomplete.sections[0].items[0].source.kind = "unknown";
    const result = validateForApproval(incomplete);
    expect(result.canApprove).toBe(false);
    expect(result.blockers.join(" ")).toContain("технологическая");
    expect(result.blockers.join(" ")).toContain("цена");
  });
});
