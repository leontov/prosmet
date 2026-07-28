import { describe, expect, it } from "vitest";
import { estimatingEvalCases } from "./catalog";

describe("estimating AI eval catalogue", () => {
  it("contains at least 50 distinct cases", () => {
    expect(estimatingEvalCases.length).toBeGreaterThanOrEqual(50);
    expect(new Set(estimatingEvalCases.map((value) => value.id)).size).toBe(estimatingEvalCases.length);
  });

  it("covers the required safety and product surfaces", () => {
    const tags = new Set(estimatingEvalCases.flatMap((value) => value.tags));
    for (const tag of ["security", "offline", "provider", "document", "mobile", "voice", "performance"]) {
      expect(tags.has(tag)).toBe(true);
    }
  });

  it("gives every domain estimate a measurable expectation", () => {
    for (const value of estimatingEvalCases) {
      expect(value.metrics.length).toBeGreaterThan(0);
      expect(value.expected.length).toBeGreaterThan(0);
    }
  });
});
