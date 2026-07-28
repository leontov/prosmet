import { describe, expect, it } from "vitest";
import { calculateEstimate, type EstimateDraft } from "@/lib/domain/estimate";
import { runRulesAgent } from "@/lib/server/rules-agent";

function estimateFrom(run: ReturnType<typeof runRulesAgent>) {
  const tool = run.tools.find((entry) => entry.name === "estimate_draft");
  expect(tool).toBeDefined();
  return tool!.args as unknown as EstimateDraft;
}

describe("Prosmet chief estimator deterministic fallback", () => {
  it.each([
    ["отопление", "Монтаж отопления дома 160 м² в Казани", "heating"],
    ["электрика", "Электромонтаж квартиры 74 м² в Москве", "electrical"],
    ["фасад", "Утепление и отделка фасада 420 м²", "facade"],
    ["благоустройство", "Благоустройство и брусчатка 300 м²", "landscaping"],
    ["демонтаж", "Демонтаж перегородок и отделки 120 м²", "demolition"],
    ["водоснабжение", "Монтаж водоснабжения и канализации 95 м²", "plumbing"],
    ["фундамент", "Устройство монолитного фундамента 140 м²", "foundation"]
  ])("creates a full chat artifact stack for %s", (_label, prompt, expectedId) => {
    const run = runRulesAgent(prompt);
    const names = run.tools.map((tool) => tool.name);
    expect(names).toContain("project_case");
    expect(names).toContain("technology_card");
    expect(names).toContain("resource_statement");
    expect(names).toContain("estimate_draft");
    expect(names).toContain("estimate_review");
    const estimate = estimateFrom(run);
    expect(estimate.id).toMatch(/^estimate_/);
    expect(estimate.technology.length).toBeGreaterThanOrEqual(7);
    expect(estimate.sections.length).toBeGreaterThan(0);
    expect(estimate.sections.flatMap((section) => section.items).length).toBeGreaterThan(3);
    expect(run.steps).toContain("review");
    expect(JSON.stringify(run.state)).toContain(expectedId === "heating" ? "отоплен" : "activeEstimate");
  });

  it("extracts the object and customer from the first field note", () => {
    const run = runRulesAgent(
      [
        "Замер на объекте.",
        "Объект: квартира Ивановых, Казань.",
        "Заказчик: Иванов Алексей.",
        "Механизированная штукатурка 96 м², слой 15 мм."
      ].join("\n")
    );
    const estimate = estimateFrom(run);
    expect(estimate.objectName).toBe("Квартира Ивановых, Казань");
    expect(estimate.customer).toBe("Иванов Алексей");
    expect(estimate.region).toBe("Казань");
  });

  it("changes a confirmed price in the same chat and creates a revision", () => {
    const initial = runRulesAgent("Механизированная штукатурка 100 м² в Казани, слой 15 мм");
    const estimate = estimateFrom(initial);
    const changed = runRulesAgent("Измени цену штукатурки на 650 рублей", {
      state: { activeEstimate: estimate }
    });
    const next = estimateFrom(changed);
    const work = next.sections.flatMap((section) => section.items).find((item) =>
      item.name.includes("Механизированная")
    );
    expect(work?.unitPrice).toBe(650);
    expect(work?.source.kind).toBe("personal");
    expect(next.revision).toBe(estimate.revision + 1);
    expect(changed.stateDelta?.some((patch) => patch.path === "/activeEstimate")).toBe(true);
  });

  it("applies a material reserve and preserves deterministic arithmetic", () => {
    const initial = runRulesAgent("Механизированная штукатурка 100 м² в Казани, слой 15 мм");
    const estimate = estimateFrom(initial);
    const before = calculateEstimate(estimate).total;
    const changed = runRulesAgent("Добавь 10% запаса к смеси", {
      state: { activeEstimate: estimate }
    });
    const next = estimateFrom(changed);
    const mixture = next.sections.flatMap((section) => section.items).find((item) =>
      item.name.includes("смесь")
    );
    expect(mixture?.coefficient).toBe(1.1);
    expect(calculateEstimate(next).total).toBeGreaterThan(before);
  });

  it("renders comparison, execution and documents without leaving the thread", () => {
    const initial = runRulesAgent("Механизированная штукатурка 80 м² в Казани");
    const estimate = estimateFrom(initial);

    const comparison = runRulesAgent("Сравни экономичный, базовый и вариант с резервом", {
      state: { activeEstimate: estimate }
    });
    expect(comparison.tools.map((tool) => tool.name)).toEqual(["estimate_comparison"]);

    const execution = runRulesAgent("Сделай акт на 60% выполнения", {
      state: { activeEstimate: estimate }
    });
    expect(execution.tools.map((tool) => tool.name)).toContain("execution_progress");
    expect(execution.tools.map((tool) => tool.name)).toContain("act_draft");

    const contract = runRulesAgent("Составь договор по этой смете", {
      state: { activeEstimate: estimate }
    });
    expect(contract.tools.map((tool) => tool.name)).toContain("contract_draft");
  });

  it("asks only for critical input when the work type is unknown", () => {
    const run = runRulesAgent("Нужно посчитать объект");
    expect(run.tools.map((tool) => tool.name)).toEqual(["project_case", "ask_user"]);
    expect(run.state.validation).toMatchObject({ status: "input_required" });
  });
});
