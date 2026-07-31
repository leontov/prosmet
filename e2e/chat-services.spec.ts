import { expect, test, type Page } from "@playwright/test";

function composer(page: Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function send(page: Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  const button = page.getByRole("button", { name: "Отправить" });
  await expect(button).toBeEnabled();
  await button.click();
}

function relevantErrors(errors: string[]) {
  return errors.filter((message) =>
    /Content Security Policy|hydration|Connection closed|ZodError|Maximum update depth|Too many re-renders|Page crashed|TypeError|ReferenceError/i.test(
      message
    )
  );
}

test("tenant services and provider RBAC are verified without leaving the assistant thread", async ({
  page
}) => {
  const runtimeErrors: string[] = [];
  const permissiveAdmin = process.env.PROSMET_ADMIN_MODE === "permissive";
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("crash", () => runtimeErrors.push("Page crashed"));

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

  await send(page, "Открой профиль и настрой организацию");
  const workspace = page.getByTestId("workspace-settings-tool");
  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await workspace.getByLabel("Имя в рабочем пространстве").fill("Владислав");
  await workspace.getByLabel("Организация или бренд").fill("Просметчик E2E");
  await workspace.getByLabel("Основной регион организации").fill("Республика Татарстан");
  await workspace.getByRole("button", { name: "Сохранить на сервере" }).click();
  await expect(workspace.getByText("Профиль и организация сохранены на сервере.")).toBeVisible();

  await workspace.getByRole("button", { name: "Смета", exact: true }).click();
  await workspace.getByLabel("Регион смет по умолчанию").fill("Республика Татарстан");
  await workspace.getByLabel("Метод расчёта по умолчанию").selectOption("resource");
  await workspace.getByLabel("НДС по умолчанию").fill("20");
  await workspace.getByRole("button", { name: "Сохранить на сервере" }).click();
  await expect(workspace.getByText("Сметные настройки сохранены на сервере.")).toBeVisible();

  await send(page, "Подключи AI-провайдер для смет");
  const providers = page.getByTestId("provider-settings-tool");
  await expect(providers).toBeVisible({ timeout: 30_000 });
  await providers.getByLabel("Тип AI-провайдера").selectOption("rules");
  await providers.getByRole("button", { name: "Проверить и подключить" }).click();

  if (permissiveAdmin) {
    await expect(providers.getByText("Соединение проверено и сохранено server-side.")).toBeVisible({
      timeout: 30_000
    });
    await expect(
      providers.getByText("Встроенный сметный сервис", { exact: true }).last()
    ).toBeVisible();
    await expect(providers.getByText("Выбран", { exact: true })).toBeVisible();
  } else {
    await expect(providers.getByText("Требуются права супер-администратора.")).toBeVisible({
      timeout: 30_000
    });
    await expect(providers.getByText("AI-провайдеры ещё не подключены.")).toBeVisible();
  }

  await send(page, "Покажи статус сервисов, PostgreSQL и синхронизации");
  const status = page.getByTestId("service-status-tool");
  await expect(status).toBeVisible({ timeout: 30_000 });
  await expect(status.getByText("PostgreSQL", { exact: true })).toBeVisible();
  await expect(status.getByText("Подключён", { exact: true })).toBeVisible();
  await expect(status.getByText("Сохраняется на сервере", { exact: true })).toBeVisible();
  if (permissiveAdmin) {
    await expect(status.getByText(/Встроенный сметный сервис/)).toBeVisible();
  } else {
    await expect(status.getByText("Не выбран", { exact: true })).toBeVisible();
  }

  await page.reload();
  const restoredWorkspace = page.getByTestId("workspace-settings-tool");
  await expect(restoredWorkspace).toBeVisible({ timeout: 30_000 });
  await expect(restoredWorkspace.getByLabel("Имя в рабочем пространстве")).toHaveValue(
    "Владислав"
  );
  await expect(restoredWorkspace.getByLabel("Организация или бренд")).toHaveValue(
    "Просметчик E2E"
  );

  expect(relevantErrors(runtimeErrors)).toEqual([]);
});
