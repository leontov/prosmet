import { describe, expect, it } from "vitest";
import {
  A2A_PROTOCOL_VERSION,
  buildDevelopmentPlan,
  developerAgents,
  prosmetDeveloperAgentCard,
  selectDeveloperAgents
} from "@/lib/server/a2a/registry";

describe("A2A developer registry", () => {
  it("publishes a unique multidisciplinary team", () => {
    expect(developerAgents.length).toBeGreaterThanOrEqual(8);
    expect(new Set(developerAgents.map((agent) => agent.id)).size).toBe(developerAgents.length);
    expect(developerAgents.every((agent) => agent.skills.length > 0)).toBe(true);
    expect(developerAgents.some((agent) => agent.id === "mobile")).toBe(true);
    expect(developerAgents.some((agent) => agent.id === "estimate-domain")).toBe(true);
    expect(developerAgents.some((agent) => agent.id === "devops")).toBe(true);
  });

  it("routes interface and mobile work to the relevant agents", () => {
    const agents = selectDeveloperAgents(
      "Переделай карточку и мобильный редактор, затем подготовь React Native приложение"
    ).map((agent) => agent.id);
    expect(agents).toContain("coordinator");
    expect(agents).toContain("frontend");
    expect(agents).toContain("mobile");
    expect(agents).toContain("qa");
  });

  it("marks release work as owner-approved deploy permission", () => {
    const plan = buildDevelopmentPlan("Исправь CI и задеплой точный SHA на production port 3200");
    expect(plan.requestedPermission).toBe("deploy");
    expect(plan.selectedAgentIds).toContain("devops");
    expect(plan.selectedAgentIds).toContain("security");
    expect(plan.stages.at(-1)?.id).toBe("release");
  });

  it("publishes the same-origin A2A Agent Card", () => {
    const card = prosmetDeveloperAgentCard("https://prosmet.example/");
    expect(card.protocolVersion).toBe(A2A_PROTOCOL_VERSION);
    expect(card.url).toBe("https://prosmet.example/api/a2a");
    expect(card.skills[0]?.id).toBe("develop-prosmet");
  });
});
