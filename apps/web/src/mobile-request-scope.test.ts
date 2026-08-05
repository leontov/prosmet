import { describe, expect, it } from "vitest";
import {
  assertScope,
  isRetriableStatus,
  requiredScope,
  retryDelayMs
} from "../../mobile/src/infrastructure/request-scope";

describe("mobile API credential boundary", () => {
  it("keeps public reads free of admin scope", () => {
    expect(requiredScope("/api/system", "GET")).toBe("public");
    expect(requiredScope("/api/agent", "POST")).toBe("public");
    expect(requiredScope("/api/estimates", "GET")).toBe("public");
    expect(requiredScope("/api/agents", "GET")).toBe("public");
    expect(() => assertScope("/api/system", "admin", "GET")).toThrow(/scope mismatch/i);
  });

  it("requires an explicit admin scope for control-plane mutations", () => {
    expect(requiredScope("/api/agents", "POST")).toBe("admin");
    expect(requiredScope("/api/agents/id/test", "POST")).toBe("admin");
    expect(requiredScope("/api/account", "GET")).toBe("admin");
    expect(requiredScope("/api/users", "GET")).toBe("admin");
    expect(() => assertScope("/api/agents/id/test", "public", "POST")).toThrow(/requires admin/i);
  });

  it("isolates user-session routes from admin and public requests", () => {
    expect(requiredScope("/api/auth/session", "GET")).toBe("user");
    expect(requiredScope("/api/auth/login", "POST")).toBe("user");
    expect(() => assertScope("/api/auth/session", "public", "GET")).toThrow(/requires user/i);
  });

  it("retries only safe transient requests with a bounded delay", () => {
    expect(isRetriableStatus(503, "GET")).toBe(true);
    expect(isRetriableStatus(429, "GET")).toBe(true);
    expect(isRetriableStatus(503, "POST")).toBe(false);
    expect(isRetriableStatus(409, "GET")).toBe(false);
    expect(retryDelayMs(12)).toBeLessThanOrEqual(9_600);
    expect(retryDelayMs(1, 90)).toBe(30_000);
  });
});
