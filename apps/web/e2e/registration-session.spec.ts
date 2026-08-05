import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

test("registration creates a session and supports logout and login", async ({ page }, testInfo) => {
  if (external && !adminToken) test.skip(true, "External admin token is required");
  const email = `session-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "Test-password-2026";
  const created = await page.request.post("/api/register", {
    data: { name: "Тестовый пользователь", email, company: "Строй QA", password }
  });
  expect(created.status(), await created.text()).toBe(201);
  const body = await created.json() as { authenticated?: boolean; user?: { id?: string; email?: string } };
  expect(body.authenticated).toBe(true);
  expect(body.user?.email).toBe(email);

  const active = await page.request.get("/api/auth/session");
  expect(active.ok(), await active.text()).toBeTruthy();
  expect(((await active.json()) as { authenticated?: boolean }).authenticated).toBe(true);

  const logout = await page.request.delete("/api/auth/logout");
  expect(logout.ok(), await logout.text()).toBeTruthy();
  const inactive = await page.request.get("/api/auth/session");
  expect(((await inactive.json()) as { authenticated?: boolean }).authenticated).toBe(false);

  const login = await page.request.post("/api/auth/login", { data: { email, password } });
  expect(login.ok(), await login.text()).toBeTruthy();
  expect(((await login.json()) as { authenticated?: boolean }).authenticated).toBe(true);

  const headers = { "x-prosmet-admin-token": adminToken! };
  const removed = await page.request.delete(`/api/users/${encodeURIComponent(body.user!.id!)}`, { headers });
  expect(removed.ok(), await removed.text()).toBeTruthy();
});
