import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

test.describe("production landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/landing");
  });

  test("shows the complete product story and interactive estimate demo", async ({ page }, testInfo) => {
    await expect(page.getByRole("heading", { name: /От запроса до КС-3/ })).toBeVisible();
    await expect(page.getByText("Ремонт ванной комнаты", { exact: true })).toBeVisible();
    await expect(page.getByText("Предварительная стоимость", { exact: true })).toBeVisible();

    const prompt = page.getByRole("textbox", { name: "Запрос для демонстрации" });
    await prompt.fill("Составь смету на механизированную штукатурку 358 м² в Татарстане");
    await page.getByRole("button", { name: "Запустить демонстрацию" }).click();
    await expect(page.getByText(/Проверяю состав работ/)).toBeVisible();
    await expect(page.getByText("Расчёт готов", { exact: true })).toBeVisible();

    const enterpriseHeading = page.getByRole("heading", {
      name: "Ваши стандарты, цены и документы становятся корпоративным AI-контуром."
    });
    await enterpriseHeading.scrollIntoViewIfNeeded();
    await expect(enterpriseHeading).toBeVisible();

    const pricingHeading = page.getByRole("heading", {
      name: "Начните с результата. Масштабируйте после доказанной ценности."
    });
    await pricingHeading.scrollIntoViewIfNeeded();
    await expect(pricingHeading).toBeVisible();
    await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();

    const finalHeading = page.getByRole("heading", {
      name: "Первую полноценную смету можно создать сегодня."
    });
    await finalHeading.scrollIntoViewIfNeeded();
    await expect(finalHeading).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole("heading", { name: /От запроса до КС-3/ })).toBeVisible();
    await page.screenshot({ path: `artifacts-landing-${testInfo.project.name}.png`, fullPage: true });
  });

  test("keeps the production application available on app route", async ({ page }, testInfo) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    if (testInfo.project.name === "mobile-chromium") {
      await expect(page.getByTestId("mobile-shell")).toBeVisible();
      await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    } else {
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Что нужно рассчитать?" })).toBeVisible();
    }
  });

  test("persists and verifies an enterprise lead", async ({ page }, testInfo) => {
    const appLink = page.getByRole("link", { name: /Составить первую смету/ });
    await expect(appLink).toHaveAttribute("href", "/app");

    if (external && !adminToken) {
      await expect(page.getByRole("button", { name: /Получить план внедрения/ })).toBeVisible();
      return;
    }

    const unique = `${testInfo.project.name}-${Date.now()}`;
    await page.getByRole("textbox", { name: "Имя" }).fill("Тестовый пользователь");
    await page.getByRole("textbox", { name: "Рабочий телефон или email" }).fill(`landing-${unique}@example.com`);
    await page.getByRole("textbox", { name: "Компания и число сотрудников" }).fill("Строй QA, 12");

    const leadResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/leads" && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: /Получить план внедрения/ }).click();
    const leadResponse = await leadResponsePromise;
    const leadBody = await leadResponse.json() as { lead?: { id?: string }; persisted?: boolean };
    expect(leadResponse.status()).toBe(201);
    expect(leadBody.persisted).toBe(true);
    expect(leadBody.lead?.id).toBeTruthy();
    await expect(page.getByText("Заявка принята", { exact: true })).toBeVisible();

    const headers = { "x-prosmet-admin-token": adminToken! };
    const listResponse = await page.request.get("/api/leads?limit=50", { headers });
    expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
    const list = await listResponse.json() as { leads?: Array<{ id: string; contact: string }> };
    expect(list.leads?.some((lead) => lead.id === leadBody.lead?.id && lead.contact === `landing-${unique}@example.com`)).toBe(true);

    const deleteResponse = await page.request.delete(`/api/leads/${encodeURIComponent(leadBody.lead!.id!)}`, { headers });
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
    await page.screenshot({ path: `artifacts-landing-lead-${testInfo.project.name}.png`, fullPage: true });
  });

  test("protects lead administration and validates required fields", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "API boundary runs once");
    const unauthenticated = await page.request.get("/api/leads");
    expect(unauthenticated.status()).toBe(401);
    const invalid = await page.request.post("/api/leads", { data: { name: "Only name" } });
    expect(invalid.status()).toBe(400);
  });

  test("has no horizontal overflow on mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only geometry assertion");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Открыть меню" })).toBeVisible();
  });
});
