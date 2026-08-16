import { expect, test } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

test.describe("production landing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/landing", { waitUntil: "networkidle" });
  });

  test("renders the SamReshu-style agent-first product story", async ({ page }, testInfo) => {
    await expect(page.locator(".sam-home")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Один агент — для смет, документов и всего между ними." })).toBeVisible();
    await expect(page.getByText("строительный агент", { exact: true })).toBeVisible();
    await expect(page.getByText("Результат", { exact: true })).toBeVisible();
    await expect(page.getByText("Предварительный итог", { exact: true })).toBeVisible();
    await expect(page.getByText("289 640 ₽", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Попробовать бесплатно/ }).first()).toHaveAttribute("href", "/app");

    const prompt = page.getByRole("textbox", { name: "Задача для ProSmet" });
    await prompt.fill("Подготовь коммерческое предложение");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Коммерческое предложение", { exact: true })).toBeVisible();

    await expect(page.locator("#work")).toContainText("Один агент для строительных задач.");
    await expect(page.locator("#documents")).toContainText("Счета, КП и акты — из одной версии сметы.");
    await expect(page.locator("#integrations")).toContainText("Оставьте ProSmet внутри вашего рабочего процесса.");
    await expect(page.locator("#pricing")).toContainText("Начните с реальной задачи.");
    await expect(page.locator("#security")).toContainText("Данные проекта остаются под контролем.");

    const faq = page.locator(".sam-faq-section");
    const faqQuestion = faq.getByRole("button", { name: "Можно ли просто написать задачу текстом?" });
    await faqQuestion.click();
    await expect(faq.getByText("Да. ProSmet рассчитан на обычный язык.", { exact: true })).toBeVisible();

    await page.screenshot({ path: `artifacts-landing-${testInfo.project.name}.png`, fullPage: true });
  });

  test("keeps the production application available on app route", async ({ page }, testInfo) => {
    await page.goto("/app", { waitUntil: "networkidle" });
    if (testInfo.project.name === "mobile-chromium") {
      await expect(page.getByTestId("mobile-shell")).toBeVisible();
      await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    } else {
      await expect(page.getByTestId("desktop-shell")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Чем я могу помочь сегодня?" })).toBeVisible();
    }
  });

  test("persists and verifies an enterprise lead", async ({ page }, testInfo) => {
    await expect(page.getByRole("link", { name: /Открыть ProSmet/ }).first()).toHaveAttribute("href", "/app");

    if (external && !adminToken) return;

    const unique = `${testInfo.project.name}-${Date.now()}`;
    await page.getByRole("textbox", { name: "Имя" }).fill("Тестовый пользователь");
    await page.getByRole("textbox", { name: "Телефон или Telegram" }).fill(`landing-${unique}@example.com`);
    await page.getByRole("textbox", { name: "Компания" }).fill("Строй QA, 12");

    const leadResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/leads" && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Записаться на демо" }).click();
    const leadResponse = await leadResponsePromise;
    const leadBody = await leadResponse.json() as { lead?: { id?: string }; persisted?: boolean };
    expect(leadResponse.status()).toBe(201);
    expect(leadBody.persisted).toBe(true);
    expect(leadBody.lead?.id).toBeTruthy();
    await expect(page.getByText("Заявка принята. Мы свяжемся с вами.", { exact: true })).toBeVisible();

    const headers = { "x-prosmet-admin-token": adminToken! };
    const listResponse = await page.request.get("/api/leads?limit=50", { headers });
    expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
    const list = await listResponse.json() as { leads?: Array<{ id: string; contact: string }> };
    expect(list.leads?.some((lead) => lead.id === leadBody.lead?.id && lead.contact === `landing-${unique}@example.com`)).toBe(true);

    const deleteResponse = await page.request.delete(`/api/leads/${encodeURIComponent(leadBody.lead!.id!)}`, { headers });
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
  });

  test("protects lead administration and validates required fields", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "API boundary runs once");
    const unauthenticated = await page.request.get("/api/leads");
    expect(unauthenticated.status()).toBe(401);
    const invalid = await page.request.post("/api/leads", { data: { name: "Only name" } });
    expect(invalid.status()).toBe(400);
  });

  test("has no horizontal overflow on mobile and keeps navigation usable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile-only geometry assertion");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Меню" })).toBeVisible();
    await page.getByRole("button", { name: "Меню" }).click();
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});
