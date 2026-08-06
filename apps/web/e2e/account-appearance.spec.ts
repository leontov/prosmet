import { expect, test, type Page } from "@playwright/test";

const external = Boolean(process.env.PROSMET_BASE_URL);
const adminToken = external ? process.env.PROSMET_E2E_ADMIN_TOKEN?.trim() || null : "e2e-admin";

function luminanceFromRgb(value: string) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
  const [red = 255, green = 255, blue = 255] = channels;
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (linear[0] ?? 1) * 0.2126 + (linear[1] ?? 1) * 0.7152 + (linear[2] ?? 1) * 0.0722;
}

function contrastRatio(first: string, second: string) {
  const left = luminanceFromRgb(first);
  const right = luminanceFromRgb(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function openAccount(page: Page, projectName: string) {
  await page.goto("/app", { waitUntil: "networkidle" });
  if (projectName === "mobile-chromium") {
    await page.getByRole("button", { name: "Открыть навигацию" }).click();
    const drawer = page.getByRole("dialog", { name: "Навигация" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Профиль" }).click();
    await expect(drawer).toBeHidden();
  } else {
    await page.getByRole("button", { name: /Кабинет/ }).click();
  }
  await expect(page.getByTestId("account-workspace")).toBeVisible();
}

async function darkSurface(page: Page, selector: string, label: string) {
  const values = await page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(luminanceFromRgb(values.background), `${label} must be dark`).toBeLessThan(0.13);
  expect(contrastRatio(values.color, values.background), `${label} text contrast`).toBeGreaterThanOrEqual(4.5);
}

test.describe("ProSmet cabinet workspace", () => {
  test("desktop cabinet has clear hierarchy, restrained panels and no overflow", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop cabinet contract");
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAccount(page, testInfo.project.name);

    await expect(page.locator(".cabinet-hero")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Профиль организации" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Доступ к аккаунту" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Состояние сервиса" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Управление входом/ })).toBeVisible();

    const layout = await page.locator(".cabinet-layout").evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { columns: style.gridTemplateColumns, width: rect.width };
    });
    expect(layout.columns.split(" ").filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(layout.width).toBeGreaterThan(900);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: "artifacts-account-desktop-light.png", fullPage: true });
  });

  test("dark cabinet uses one coherent surface system", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Desktop dark cabinet contract");
    await page.addInitScript(() => {
      window.localStorage.setItem("prosmet.workspace.theme.v1", "dark");
    });
    await openAccount(page, testInfo.project.name);

    await expect(page.locator("html")).toHaveAttribute("data-prosmet-theme", "dark");
    await darkSurface(page, ".cabinet-workspace", "Cabinet workspace");
    await darkSurface(page, ".cabinet-profile-panel", "Organization panel");
    await darkSurface(page, ".cabinet-access-panel", "Account access panel");
    await darkSurface(page, ".cabinet-system-panel", "System panel");
    await darkSurface(page, ".cabinet-security-panel", "Security panel");

    const inputs = page.locator(".cabinet-access-fields input");
    if (await inputs.count()) {
      const inputStyle = await inputs.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color };
      });
      expect(luminanceFromRgb(inputStyle.background)).toBeLessThan(0.16);
      expect(contrastRatio(inputStyle.color, inputStyle.background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-account-desktop-dark.png", fullPage: true });
  });

  test("mobile cabinet preserves full functionality in one readable column", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile cabinet contract");
    await openAccount(page, testInfo.project.name);

    await expect(page.locator(".cabinet-hero")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Профиль организации" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Доступ к аккаунту" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "ИИ-подключение" })).toBeVisible();

    const actionHeight = await page.getByRole("button", { name: /Управление входом/ }).evaluate((element) => element.getBoundingClientRect().height);
    expect(actionHeight).toBeGreaterThanOrEqual(48);
    const columns = await page.locator(".cabinet-layout").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(columns.split(" ").filter(Boolean)).toHaveLength(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-account-mobile-light.png", fullPage: true });
  });

  test("mobile dark cabinet has no white panel leaks", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "Mobile dark cabinet contract");
    await page.addInitScript(() => {
      window.localStorage.setItem("prosmet.workspace.theme.v1", "dark");
    });
    await openAccount(page, testInfo.project.name);

    await darkSurface(page, ".cabinet-status-strip", "Mobile status strip");
    await darkSurface(page, ".cabinet-profile-panel", "Mobile organization panel");
    await darkSurface(page, ".cabinet-access-panel", "Mobile access panel");
    await darkSurface(page, ".cabinet-agent-panel", "Mobile agent panel");
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "artifacts-account-mobile-dark.png", fullPage: true });
  });

  test("a real user session is reflected immediately in the cabinet", async ({ page }, testInfo) => {
    test.skip(external || testInfo.project.name !== "desktop-chromium", "Local user-session UI regression runs once");
    const unique = `cabinet-${Date.now()}`;
    const email = `${unique}@example.com`;
    const create = await page.request.post("/api/register", {
      data: {
        name: "Владислав Тест",
        email,
        company: "ProSmet QA",
        password: "StrongPass123"
      }
    });
    expect(create.status(), await create.text()).toBe(201);
    const created = await create.json() as { user?: { id?: string } };

    try {
      await openAccount(page, testInfo.project.name);
      await expect(page.getByText("Владислав Тест", { exact: true }).first()).toBeVisible();
      await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Выйти из аккаунта" })).toBeVisible();
      await page.screenshot({ path: "artifacts-account-desktop-session.png", fullPage: true });
    } finally {
      await page.request.delete("/api/auth/logout").catch(() => undefined);
      if (created.user?.id && adminToken) {
        await page.request.delete(`/api/users/${encodeURIComponent(created.user.id)}`, {
          headers: { "x-prosmet-admin-token": adminToken }
        }).catch(() => undefined);
      }
    }
  });
});
