import { expect, test } from "@playwright/test";

test.describe("published OpenAPI contract", () => {
  test("publishes OpenAPI 3.1 with route scopes and no provider secrets", async ({ request }) => {
    const response = await request.get("/api/openapi.json");
    expect(response.status(), await response.text()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const document = await response.json() as {
      openapi?: string;
      paths?: Record<string, Record<string, {
        operationId?: string;
        security?: Array<Record<string, unknown>>;
        "x-prosmet-scope"?: string;
      }>>;
      components?: {
        schemas?: Record<string, unknown>;
        securitySchemes?: Record<string, unknown>;
      };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.paths?.["/api/health"]?.get?.operationId).toBe("getHealth");
    expect(document.paths?.["/api/auth/login"]?.post?.["x-prosmet-scope"]).toBe("public");
    expect(document.paths?.["/api/auth/logout"]?.delete?.["x-prosmet-scope"]).toBe("user");
    expect(document.paths?.["/api/agents/{agentId}/test"]?.post?.["x-prosmet-scope"]).toBe("admin");

    const adminSecurity = JSON.stringify(
      document.paths?.["/api/agents/{agentId}/test"]?.post?.security || []
    );
    expect(adminSecurity).toContain("adminCookie");
    expect(adminSecurity).toContain("adminToken");

    expect(document.components?.securitySchemes).toHaveProperty("userCookie");
    expect(document.components?.securitySchemes).toHaveProperty("adminCookie");
    expect(document.components?.securitySchemes).toHaveProperty("adminToken");

    const agentSchema = JSON.stringify(document.components?.schemas?.AgentDescriptor || {});
    expect(agentSchema).not.toContain("secretCipher");
    expect(agentSchema).not.toContain("passwordHash");
    expect(agentSchema).not.toContain("adminToken");
  });
});
