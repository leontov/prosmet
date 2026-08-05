import { expect, test } from "@playwright/test";
const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";
test("registered users persist, duplicate emails are rejected, and admin access is protected", async ({ page }, testInfo) => {
  if (external && !adminToken) test.skip(true, "External admin token is required");
  const email = `prosmet-${testInfo.project.name}-${Date.now()}@example.com`;
  const created = await page.request.post("/api/register", { data: { name: "Пользователь ProSmet", email, company: "Строй QA", password: "StrongPass123" } });
  expect(created.status(), await created.text()).toBe(201);
  const body = await created.json() as { user?: { id?: string; email?: string } };
  expect(body.user?.email).toBe(email);
  expect((await page.request.post("/api/register", { data: { name: "Повтор", email, company: "Строй QA", password: "StrongPass123" } })).status()).toBe(409);
  expect((await page.request.get("/api/users")).status()).toBe(401);
  const headers = { "x-prosmet-admin-token": adminToken! };
  const list = await page.request.get("/api/users?limit=50", { headers }); expect(list.ok(), await list.text()).toBeTruthy();
  expect(((await list.json()) as { users?: Array<{ id: string; email: string }> }).users?.some((u) => u.id === body.user?.id && u.email === email)).toBe(true);
  const removed = await page.request.delete(`/api/users/${encodeURIComponent(body.user!.id!)}`, { headers }); expect(removed.ok(), await removed.text()).toBeTruthy();
});
