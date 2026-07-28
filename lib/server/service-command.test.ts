import { describe, expect, it } from "vitest";
import { runServiceCommand } from "@/lib/server/service-command";

describe("runServiceCommand", () => {
  it("opens profile and organization settings in the chat", () => {
    const result = runServiceCommand("Открой профиль и настрой организацию");
    expect(result?.tools[0]).toEqual({
      name: "workspace_settings",
      args: { section: "profile" }
    });
    expect(result?.steps).toContain("load-workspace-service");
  });

  it("opens estimating defaults in the chat", () => {
    const result = runServiceCommand("Измени регион, НДС и метод расчёта");
    expect(result?.tools[0]).toEqual({
      name: "workspace_settings",
      args: { section: "estimating" }
    });
  });

  it.each([
    ["Подключи MiMo Code", "mimo"],
    ["Настрой Ollama", "ollama"],
    ["Подключи OpenAI API для Codex", "openai-compatible"]
  ])("chooses a provider hint for %s", (prompt, expected) => {
    const result = runServiceCommand(prompt);
    expect(result?.tools[0]?.name).toBe("provider_settings");
    expect(result?.tools[0]?.args.providerHint).toBe(expected);
  });

  it("opens live service status", () => {
    const result = runServiceCommand("Проверь backend, PostgreSQL и синхронизацию");
    expect(result?.tools[0]?.name).toBe("service_status");
    expect(result?.steps).toContain("check-services");
  });

  it("does not intercept an estimating request", () => {
    expect(
      runServiceCommand("Составь смету штукатурки 120 м² в Казани")
    ).toBeNull();
  });
});
