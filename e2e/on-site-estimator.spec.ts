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

test("a measurer can edit an estimate on site and hand it to a client", async ({
  page
}) => {
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

  const handoff = page.getByTestId("estimate-handoff");
  const editor = page.getByTestId("estimate-editor");
  await expect(handoff).toBeVisible({ timeout: 30_000 });
  await expect(editor).toBeVisible({ timeout: 30_000 });

  await expect(editor.getByLabel("Объект")).toHaveValue("Квартира Ивановых, Казань");
  await expect(editor.getByLabel("Заказчик")).toHaveValue("Иванов Алексей");
  const workPrice = editor.getByLabel("Цена позиции 1").last();
  await workPrice.fill("650");
  await expect(workPrice).toHaveValue("650");

  await handoff.getByRole("button", { name: "Поделиться сметой с клиентом" }).click();
  const share = page.getByRole("dialog", { name: "Передать смету клиенту" });
  await expect(share).toBeVisible({ timeout: 30_000 });
  await expect(share.getByText("Квартира Ивановых, Казань", { exact: true })).toBeVisible();
  await expect(share.getByText("Иванов Алексей", { exact: true })).toBeVisible();
  await expect(share.getByRole("button", { name: /WhatsApp/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Электронная почта/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Скачать PDF/ })).toBeVisible();
  await expect(share.getByRole("button", { name: /Скопировать итог/ })).toBeVisible();

  await share.getByRole("button", { name: /Скопировать итог/ }).click();
  await expect(share.getByText(/Краткая смета скопирована/)).toBeVisible();

  const pdfDownload = page.waitForEvent("download");
  await share.getByRole("button", { name: /Скачать PDF/ }).click();
  expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/i);
  await expect(share.getByText(/PDF сохранён на устройстве/)).toBeVisible();

  await share.getByRole("button", { name: /WhatsApp/ }).click();
  await expect(share).toHaveCount(0);
  await expect(handoff.getByText("Передана клиенту", { exact: true })).toBeVisible();
  await expect(editor.getByText("Передана клиенту", { exact: true })).toBeVisible();

  const opened = await page.evaluate(
    () => (window as typeof window & { __prosmetOpenedUrls?: string[] }).__prosmetOpenedUrls ?? []
  );
  expect(opened.some((url) => url.startsWith("https://wa.me/?text="))).toBe(true);

  await page.reload();
  await expect(page.getByTestId("estimate-handoff")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("estimate-editor").getByText("Передана клиенту", { exact: true })).toBeVisible();

  const relevant = runtimeErrors.filter((message) =>
    /Content Security Policy|hydration|Connection closed|ZodError|Maximum update depth|Too many re-renders|Page crashed|TypeError|ReferenceError/i.test(
      message
    )
  );
  expect(relevant).toEqual([]);
});
