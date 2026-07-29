import { expect, test, type Page } from "@playwright/test";

function composer(page: Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function send(page: Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  await page.getByRole("button", { name: "Отправить" }).click();
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("crash", () => errors.push("Page crashed"));
  return errors;
}

async function estimateStatus(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<string | null>((resolve) => {
        const request = indexedDB.open("prosmet-cache-v3");
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("estimates", "readonly");
          const all = transaction.objectStore("estimates").getAll();
          transaction.oncomplete = () => {
            const latest = (all.result as Array<{ draft?: { status?: string }; updatedAt?: string }>)
              .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
            database.close();
            resolve(latest?.draft?.status ?? null);
          };
          transaction.onerror = () => {
            database.close();
            resolve(null);
          };
        };
      })
  );
}

test("a measurer edits the printable estimate and hands it to a client", async ({
  page
}, testInfo) => {
  const runtimeErrors = watchErrors(page);
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.defineProperty(window, "__prosmetOpenedUrls", {
      configurable: true,
      value: opened
    });
    window.open = ((url?: string | URL) => {
      opened.push(String(url ?? ""));
      return null;
    }) as typeof window.open;
  });

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

  await send(
    page,
    [
      "Замер на объекте.",
      "Объект: квартира Ивановых, Казань.",
      "Заказчик: Иванов Алексей.",
      "Механизированная гипсовая штукатурка стен 96 м², средний слой 15 мм.",
      "Учти укрытие, грунт, маяки, углы, смесь, доставку, подъём и уборку."
    ].join("\n")
  );

  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: /Открыть смету/ }).click();

  const overlay = page.getByTestId("estimate-document-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByLabel("Объект")).toHaveValue("Квартира Ивановых, Казань");
  await expect(overlay.getByLabel("Заказчик")).toHaveValue("Иванов Алексей");

  if (testInfo.project.name === "mobile-chromium") {
    await overlay
      .getByRole("button", { name: /Укрытие и защита поверхностей/ })
      .click();
    const rowEditor = page.getByRole("dialog", { name: "Редактирование позиции" });
    await expect(rowEditor).toBeVisible();
    const mobilePrice = rowEditor.getByLabel("Цена");
    await mobilePrice.fill("650");
    await mobilePrice.blur();
    await expect(mobilePrice).toHaveValue("650");
    await rowEditor.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(rowEditor).toHaveCount(0);
  } else {
    const workPrice = overlay.getByLabel("Цена позиции 1");
    await workPrice.fill("650");
    await workPrice.blur();
    await expect(workPrice).toHaveValue("650");
  }

  await overlay.getByRole("button", { name: "Готово", exact: true }).click();
  const preview = page.getByTestId("estimate-revision-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });

  const applicationUrl = page.url();
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    preview.getByRole("button", { name: /Скачать PDF/ }).click()
  ]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/i);
  expect(page.url()).toBe(applicationUrl);
  await expect(preview).toBeVisible();

  await preview.getByRole("button", { name: /Поделиться/ }).click();
  const share = page.getByRole("dialog", { name: "Передача сметы клиенту" });
  await expect(share).toBeVisible();
  await expect(share.getByRole("button", { name: /WhatsApp/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Электронная почта/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Скачать PDF/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Скопировать итог/ })).toBeVisible();

  await share.getByRole("button", { name: /WhatsApp/ }).click();
  await expect(share).toHaveCount(0);
  await expect.poll(() => estimateStatus(page)).toBe("sent");

  const opened = await page.evaluate(
    () => (window as typeof window & { __prosmetOpenedUrls?: string[] }).__prosmetOpenedUrls ?? []
  );
  expect(opened.some((url) => url.startsWith("https://wa.me/?text="))).toBe(true);

  await page.reload();
  const restoredCard = page.getByTestId("estimate-artifact-card");
  await expect(restoredCard).toBeVisible({ timeout: 30_000 });
  await expect(restoredCard.getByText("Передана клиенту", { exact: true })).toBeVisible();

  const relevant = runtimeErrors.filter((message) =>
    /Content Security Policy|hydration|Connection closed|ZodError|Maximum update depth|Too many re-renders|Page crashed|TypeError|ReferenceError|validateDOMNesting/i.test(
      message
    )
  );
  expect(relevant).toEqual([]);
});
