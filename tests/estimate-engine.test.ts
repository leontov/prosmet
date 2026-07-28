import { describe, expect, it } from "vitest";
import { buildPlasteringEstimate, buildPlasteringTechnologyCard, parsePlasteringRequest, reviewEstimate } from "@/lib/domain/plastering";
import { recalculateEstimate } from "@/lib/domain/estimate-engine";

const prompt = "Составь полную смету механизированной гипсовой штукатурки 358 м² в Лениногорске. Средний слой 15 мм.";

describe("plastering vertical slice", () => {
  it("extracts area, layer and region", () => {
    expect(parsePlasteringRequest(prompt)).toEqual({ area: 358, thicknessMm: 15, region: "Лениногорск" });
  });
  it("builds technology before estimate", () => {
    const technology = buildPlasteringTechnologyCard(prompt);
    expect(technology.operations.length).toBeGreaterThanOrEqual(12);
    expect(technology.operations.some((value) => value.stage === "Монтаж маяков")).toBe(true);
    expect(technology.operations.some((value) => value.stage === "Логистика")).toBe(true);
  });
  it("creates deterministic and arithmetically tied estimate", () => {
    const technology = buildPlasteringTechnologyCard(prompt);
    const estimate = buildPlasteringEstimate(prompt, technology);
    const recalculated = recalculateEstimate(estimate);
    expect(estimate.sections.length).toBe(4);
    expect(estimate.sections.flatMap((value) => value.items).length).toBeGreaterThanOrEqual(12);
    expect(estimate.totals.grandTotal).toBe(recalculated.totals.grandTotal);
    expect(estimate.totals.grandTotal).toBeGreaterThan(0);
  });
  it("never invents a normative code", () => {
    const estimate = buildPlasteringEstimate(prompt, buildPlasteringTechnologyCard(prompt));
    expect(estimate.sections.flatMap((value) => value.items).every((value) => value.code === null)).toBe(true);
    expect(estimate.warnings.join(" ")).toContain("Нормативные коды не присвоены");
  });
  it("reports unconfirmed prices", () => {
    const estimate = buildPlasteringEstimate(prompt, buildPlasteringTechnologyCard(prompt));
    const review = reviewEstimate(estimate);
    expect(review.status).toBe("passed-with-warnings");
    expect(review.checks.find((value) => value.name === "Цены")?.status).toBe("warning");
  });
});
