import { expect, test } from "@playwright/test";

test("greenfield shell, reference mobile start and estimate editor pass", async ({ page }, testInfo) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") violations.push(`console:${message.text()}`);
  });
  page.on("pageerror", (error) => violations.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => violations.push(`requestfailed:${request.url()}:${request.failure()?.errorText ?? "unknown"}`));

  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`CSP:${event.violatedDirective}:${event.blockedURI}`);
    });
  });

  await page.goto("/", { waitUntil: "networkidle" });

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByText("Просметчик", { exact: true })).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Что нужно сделать?" })).toBeVisible();

    await page.getByRole("button", { name: /Владислав/ }).click();
    await expect(page.getByRole("heading", { name: "Кабинет" })).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
    await page.getByRole("button", { name: "Чаты", exact: true }).click();
  } else {
    await expect(page.getByTestId("mobile-shell")).toBeVisible();
    await expect(page.getByTestId("desktop-shell")).toHaveCount(0);
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    await expect(page.locator(".mobile-bottom-nav")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Новый расчёт" })).toHaveCount(0);

    await expect(page.getByRole("button", { name: "Создать изображение" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Напиши или отредактируй" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Искать в интернете" })).toBeVisible();
    await expect(page.getByPlaceholder("Спросить Просметчик...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Голосовой ввод" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Отправить" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Выбрать раздел" })).toContainText("Чат");

    const topMenu = page.getByRole("button", { name: "Открыть навигацию" });
    const menuBox = await topMenu.boundingBox();
    expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(52);
    expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(52);

    const composer = page.locator(".mobile-reference-composer");
    const composerBox = await composer.boundingBox();
    expect(composerBox?.height ?? 0).toBeGreaterThanOrEqual(60);
    const composerRadius = await composer.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius));
    expect(composerRadius).toBeGreaterThanOrEqual(30);

    const openMenu = async () => {
      await topMenu.click();
      const dialog = page.getByRole("dialog", { name: "Навигация" });
      await expect(dialog).toBeVisible();
      return dialog;
    };

    let menu = await openMenu();
    await menu.getByRole("button", { name: /Профиль/ }).click();
    await expect(page.getByRole("heading", { name: "Кабинет" })).toBeVisible();

    menu = await openMenu();
    await menu.getByRole("button", { name: /Настройки/ }).click();
    await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();

    menu = await openMenu();
    await menu.getByRole("button", { name: /^Чат/ }).click();
    await expect(page.getByTestId("mobile-reference-start")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Навигация" })).toHaveCount(0);
  }

  await page.screenshot({ path: `artifacts-shell-${testInfo.project.name}.png`, fullPage: true });

  if (testInfo.project.name === "desktop-chromium") {
    await page.getByRole("button", { name: /Механизированная штукатурка/ }).click();
  } else {
    await page.getByRole("button", { name: "Искать в интернете" }).click();
  }

  const editor = page.getByRole("dialog", { name: "Редактор сметы" });
  await expect(editor).toBeVisible({ timeout: 20_000 });

  if (testInfo.project.name === "desktop-chromium") {
    await expect(editor.locator("#estimate-title")).toHaveValue("Механизированная штукатурка квартиры");
    const desktopEditor = page.getByTestId("desktop-estimate-editor");
    await expect(desktopEditor).toBeVisible();
    await expect(editor.locator(".estimate-summary")).toBeVisible();
    const editorBox = await desktopEditor.boundingBox();
    expect(editorBox?.width ?? 0).toBeGreaterThan(1200);
  } else {
    await expect(editor.getByRole("heading", { name: "Механизированная штукатурка квартиры" })).toBeVisible();
    const mobileEditor = page.getByTestId("mobile-estimate-editor");
    await expect(mobileEditor).toBeVisible();
    const card = editor.locator(".mobile-estimate-item").first();
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(112);
    const titleField = card.locator("textarea").first();
    const titleGeometry = await titleField.evaluate((element) => ({
      fontSize: parseFloat(getComputedStyle(element).fontSize),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    expect(titleGeometry.fontSize).toBeGreaterThanOrEqual(16);
    expect(titleGeometry.scrollWidth).toBeLessThanOrEqual(titleGeometry.clientWidth + 1);
    expect(titleGeometry.scrollHeight).toBeLessThanOrEqual(titleGeometry.clientHeight + 1);
    const actionbar = editor.locator(".mobile-estimate-actions");
    expect((await actionbar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(72);
  }

  await page.screenshot({ path: `artifacts-estimate-${testInfo.project.name}.png`, fullPage: true });
  expect(violations).toEqual([]);
});
