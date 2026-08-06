import { describe, expect, it } from "vitest";
import {
  MIMO_RECOMMENDED_MODEL,
  isLegacyMiMoModel,
  isMiMoApiUrl,
  isMiMoConsoleOrDocsUrl,
  normalizeOpenAIBaseUrl,
  openAIChatCompletionsUrl,
  recommendedMiMoBaseUrl
} from "./provider-endpoints.mjs";

describe("Xiaomi MiMo OpenAI-compatible endpoint helpers", () => {
  it("normalizes the pay-as-you-go root to /v1", () => {
    expect(normalizeOpenAIBaseUrl("https://api.xiaomimimo.com"))
      .toBe("https://api.xiaomimimo.com/v1");
    expect(openAIChatCompletionsUrl("https://api.xiaomimimo.com"))
      .toBe("https://api.xiaomimimo.com/v1/chat/completions");
  });

  it("normalizes every documented Token Plan cluster", () => {
    for (const region of ["cn", "sgp", "ams"]) {
      const base = `https://token-plan-${region}.xiaomimimo.com/v1`;
      expect(isMiMoApiUrl(base)).toBe(true);
      expect(normalizeOpenAIBaseUrl(`${base}/chat/completions`)).toBe(base);
      expect(openAIChatCompletionsUrl(base)).toBe(`${base}/chat/completions`);
    }
  });

  it("rejects console and documentation hosts as API endpoints", () => {
    expect(isMiMoConsoleOrDocsUrl("https://platform.xiaomimimo.com/console"))
      .toBe(true);
    expect(isMiMoConsoleOrDocsUrl("https://mimo.mi.com/docs"))
      .toBe(true);
  });

  it("recognizes legacy V2 model identifiers", () => {
    expect(isLegacyMiMoModel("mimo-v2-flash")).toBe(true);
    expect(isLegacyMiMoModel("mimo-v2.5-pro")).toBe(false);
    expect(MIMO_RECOMMENDED_MODEL).toBe("mimo-v2.5-pro");
  });

  it("returns documented preset base URLs", () => {
    expect(recommendedMiMoBaseUrl()).toBe("https://api.xiaomimimo.com/v1");
    expect(recommendedMiMoBaseUrl({ tokenPlan: true, region: "sgp" }))
      .toBe("https://token-plan-sgp.xiaomimimo.com/v1");
  });
});
