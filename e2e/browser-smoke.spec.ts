import { expect, test } from "@playwright/test";

function collectFatalErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("crash", () => errors.push("page-crash"));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test("the application hydrates and remains interactive", async ({ page }, testInfo) => {
  const errors = collectFatalErrors(page);
  const startedAt = Date.now();
  const response = await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: 15_000
  });

  expect(response?.ok()).toBeTruthy();
  expect(response?.headers()["cache-control"] ?? "").toContain("no-store");

  const composer = page.getByLabel("Сообщение Просметчику");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible({ timeout: 10_000 });
  await expect(composer).toBeEditable({ timeout: 10_000 });

  const frameProbe = await page.evaluate(
    () =>
      new Promise<{ frames: number; elapsed: number }>((resolve, reject) => {
        const begun = performance.now();
        let frames = 0;
        const timeout = window.setTimeout(
          () => reject(new Error(`event-loop-timeout:${frames}`)),
          2500
        );
        const frame = () => {
          frames += 1;
          if (frames >= 18) {
            clearTimeout(timeout);
            resolve({ frames, elapsed: performance.now() - begun });
            return;
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      })
  );
  expect(frameProbe.frames).toBe(18);
  expect(frameProbe.elapsed).toBeLessThan(2500);

  await composer.fill("Живая проверка интерфейса");
  await expect(composer).toHaveValue("Живая проверка интерфейса");
  await composer.press("ControlOrMeta+A");
  await composer.press("Backspace");
  await expect(composer).toHaveValue("");

  const visibleSidebar = page.locator('[data-testid="app-sidebar"]:visible');
  const visibleInspector = page.locator('[data-testid="right-inspector"]:visible');

  if (testInfo.project.name === "desktop-chromium") {
    await expect(visibleSidebar).toHaveCount(1);
    // Premium customer view is intentionally quiet: supporting diagnostics are
    // available on demand rather than permanently consuming document width.
    await expect(visibleInspector).toHaveCount(0);
    await page.getByRole("button", { name: "Рабочий контекст" }).click();
    await expect(visibleInspector).toHaveCount(1);
    await visibleInspector.getByRole("button", { name: "Закрыть контекст" }).click();
    await expect(visibleInspector).toHaveCount(0);
  } else {
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expect(visibleSidebar).toHaveCount(1);
    await page.getByRole("button", { name: "Скрыть боковую панель" }).click();
    await expect(visibleSidebar).toHaveCount(0);
    await page.getByRole("button", { name: "Рабочий контекст" }).click();
    await expect(visibleInspector).toHaveCount(1);
    await visibleInspector.getByRole("button", { name: "Закрыть контекст" }).click();
    await expect(visibleInspector).toHaveCount(0);
  }

  const backend = await page.request.get("/api/backend/status");
  expect(backend.ok()).toBeTruthy();
  const status = (await backend.json()) as {
    database?: { connected?: boolean; driver?: string };
    localFirst?: { browserCache?: string; wasm?: boolean };
  };
  expect(status.database?.connected).toBe(true);
  expect(status.database?.driver).toBe("postgres");
  expect(status.localFirst?.browserCache).toBe("IndexedDB");
  expect(status.localFirst?.wasm).toBe(false);

  for (const obsolete of ["/sql-wasm.wasm", "/sql-wasm-browser.wasm"]) {
    expect((await page.request.get(obsolete)).status()).toBe(404);
  }

  await page.waitForTimeout(750);
  expect(errors).toEqual([]);
  expect(Date.now() - startedAt).toBeLessThan(15_000);
});
