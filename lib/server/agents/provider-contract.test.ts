import { describe, expect, it } from "vitest";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt
} from "@/lib/server/agents/provider-contract";

describe("provider interpretation contract", () => {
  it("parses a strict semantic interpretation", () => {
    const result = parseProviderInterpretation(
      JSON.stringify({
        action: "estimate",
        summary: "Понял задачу по штукатурке квартиры.",
        normalizedRequest:
          "Составить смету механизированной гипсовой штукатурки 358 м² в Лениногорске, слой 15 мм.",
        assumptions: ["Высота помещений до 3 м."],
        warnings: ["Этаж и наличие грузового лифта не указаны."],
        confidence: 91
      })
    );
    expect(result.action).toBe("estimate");
    expect(result.normalizedRequest).toContain("358 м²");
    expect(result.confidence).toBe(91);
  });

  it("accepts fenced JSON but rejects prose without a contract", () => {
    expect(
      parseProviderInterpretation(`\`\`\`json
      {"action":"question","summary":"Нужно уточнение.","normalizedRequest":"Уточнить площадь.","assumptions":[],"warnings":["Площадь не указана."],"confidence":40}
      \`\`\``).action
    ).toBe("question");
    expect(() => parseProviderInterpretation("Я всё понял и скоро отвечу.")).toThrow(
      /структурированный JSON/
    );
  });

  it("forbids invented prices and hidden reasoning in the provider prompt", () => {
    const system = providerSystemPrompt();
    expect(system).toContain("Не выдумывай официальные нормы");
    expect(system).toContain("Никакого Markdown");
    expect(system).toContain("chain-of-thought");
    const user = providerUserPrompt({
      prompt: "Составь смету штукатурки 100 м²",
      messages: [{ role: "user", content: "предыдущая реплика" }],
      state: { estimateRevision: 2 }
    });
    expect(user).toContain("Составь смету штукатурки 100 м²");
    expect(user).toContain("estimateRevision");
  });
});
