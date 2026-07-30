import { expect, test, type Page } from "@playwright/test";

function composer(page: Page) {
  return page.getByLabel("Сообщение Просметчику");
}

function visibleSidebar(page: Page) {
  return page.locator('[data-testid="app-sidebar"]:visible');
}

async function openSidebar(page: Page) {
  await page.waitForTimeout(180);
  const sidebar = visibleSidebar(page);
  if ((await sidebar.count()) > 0) {
    await expect(sidebar).toBeVisible();
    return sidebar;
  }
  const menu = page.getByRole("button", { name: "Открыть меню" });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(sidebar).toHaveCount(1);
  await expect(sidebar).toBeVisible();
  return sidebar;
}

async function navigate(page: Page, label: string) {
  const sidebar = await openSidebar(page);
  await sidebar.getByRole("button", { name: label, exact: true }).click();
}

async function send(page: Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  await expect(page.getByRole("button", { name: "Отправить" })).toBeEnabled();
  await page.getByRole("button", { name: "Отправить" }).click();
}

async function openThreadMenu(page: Page, title: string) {
  const sidebar = await openSidebar(page);
  const actions = sidebar.getByRole("button", {
    name: `Действия: ${title}`,
    exact: true
  });
  const row = actions.locator("..");
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await expect(actions).toHaveCSS("opacity", "1");
  await actions.click();
  return sidebar;
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

function relevantErrors(errors: string[]) {
  return errors.filter((message) =>
    /Content Security Policy|hydration|Connection closed|ZodError|Maximum update depth|Too many re-renders|Page crashed|IndexedDB.*not found|TypeError|ReferenceError|validateDOMNesting|Speech adapter|Feedback adapter/i.test(
      message
    )
  );
}

test("all workspace sections and thread history actions are functional", async ({
  page
}, testInfo) => {
  const runtimeErrors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();

  const estimatePrompt =
    "Составь полную смету механизированной гипсовой штукатурки 84 м² в Казани. Средний слой 15 мм. Учти подготовку, маяки, углы, материалы, логистику и уборку.";
  const threadTitle = estimatePrompt.slice(0, 72);
  await send(page, estimatePrompt);

  const card = page.getByTestId("estimate-artifact-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: /Открыть смету/ }).click();
  const overlay = page.getByTestId("estimate-document-overlay");
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: "Сохранить версию", exact: true }).click();
  const preview = page.getByTestId("estimate-revision-preview");
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await overlay.getByRole("button", { name: "Передать клиенту", exact: true }).click();
  const share = page.getByRole("dialog", { name: "Передача сметы клиенту" });
  await share.getByRole("button", { name: /Скопировать итог/ }).click();
  await expect(share).toHaveCount(0);
  await overlay.getByRole("button", { name: "Закрыть редактор", exact: true }).click();
  await expect(overlay).toHaveCount(0);

  await navigate(page, "Объекты");
  const objectsView = page.getByTestId("objects-view");
  await expect(objectsView).toBeVisible();
  await expect(objectsView.getByText("Строительный объект", { exact: true })).toBeVisible();

  await navigate(page, "Сметы");
  const estimatesView = page.getByTestId("estimates-view");
  await expect(estimatesView).toBeVisible();
  await expect(
    estimatesView.getByText("Механизированная гипсовая штукатурка — 84 м²", { exact: true })
  ).toBeVisible();
  await expect(estimatesView.getByRole("button", { name: "PDF", exact: true })).toBeEnabled();
  await expect(estimatesView.getByRole("button", { name: "XLSX", exact: true })).toBeEnabled();

  if (testInfo.project.name === "desktop-chromium") {
    const pdfDownload = page.waitForEvent("download");
    await estimatesView.getByRole("button", { name: "PDF", exact: true }).click();
    expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/i);

    const xlsxDownload = page.waitForEvent("download");
    await estimatesView.getByRole("button", { name: "XLSX", exact: true }).click();
    expect((await xlsxDownload).suggestedFilename()).toMatch(/\.xlsx$/i);
  }

  await estimatesView.getByRole("button", { name: "Открыть в чате" }).click();
  const estimateExperience = page.getByTestId("estimate-document-experience");
  await expect(estimateExperience).toBeVisible();
  await expect(
    estimateExperience
      .getByTestId("estimate-artifact-card")
      .or(estimateExperience.getByTestId("estimate-revision-preview"))
  ).toBeVisible();

  await send(page, "Сделай коммерческое предложение по текущей смете.");
  const documentEditor = page.getByTestId("document-editor");
  await expect(documentEditor).toBeVisible({ timeout: 30_000 });
  const documentTitle = documentEditor.getByLabel("Название документа");
  await documentTitle.fill("Коммерческое предложение на выполнение строительных работ — E2E");
  await documentEditor.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(documentEditor.getByRole("button", { name: "Сохранено", exact: true })).toBeVisible();

  await navigate(page, "Документы");
  const documentsView = page.getByTestId("documents-view");
  await expect(documentsView).toBeVisible();
  await expect(
    documentsView.getByText("Коммерческое предложение на выполнение строительных работ — E2E", { exact: true })
  ).toBeVisible();
  if (testInfo.project.name === "desktop-chromium") {
    const docDownload = page.waitForEvent("download");
    await documentsView.getByRole("button", { name: "DOC", exact: true }).click();
    expect((await docDownload).suggestedFilename()).toMatch(/\.doc$/i);
  }

  await navigate(page, "Цены");
  const pricesView = page.getByTestId("prices-view");
  await expect(pricesView).toBeVisible();
  await expect(pricesView.getByText("Механизированная гипсовая штукатурка", { exact: true })).toBeVisible();
  await expect(pricesView.getByText("Подтверждена", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Настройки" }).click();
  const settings = page.getByTestId("settings-view");
  await expect(settings).toBeVisible();
  await settings.getByLabel("Регион по умолчанию").fill("Республика Татарстан");
  await settings.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(settings.getByRole("button", { name: "Сохранено" })).toBeVisible();

  const profileButton = page.getByRole("button", { name: /Профиль и организация/ });
  if (!(await profileButton.isVisible())) {
    await openSidebar(page);
  }
  await page.getByRole("button", { name: /Профиль и организация/ }).click();
  const profile = page.getByTestId("profile-view");
  await expect(profile).toBeVisible();
  await profile.getByLabel("Имя").fill("Владислав");
  await profile.getByLabel("Название организации или бренда").fill("Просметчик");
  await profile.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(profile.getByRole("button", { name: "Сохранено" })).toBeVisible();

  await navigate(page, "Чаты");
  await expect(page.getByTestId("estimate-document-experience")).toBeVisible();

  let sidebar = await openThreadMenu(page, threadTitle);
  await sidebar.getByRole("button", { name: "Переименовать", exact: true }).click();
  const renamed = `Объект навигации ${testInfo.project.name}`;
  const renameDialog = page.getByRole("dialog", { name: "Переименовать чат" });
  await renameDialog.getByLabel("Новое название чата").fill(renamed);
  await renameDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  sidebar = await openSidebar(page);
  await expect(sidebar.getByText(renamed, { exact: true })).toBeVisible();

  sidebar = await openThreadMenu(page, renamed);
  await sidebar.getByRole("button", { name: "Закрепить", exact: true }).click();
  sidebar = await openSidebar(page);
  await expect(sidebar.getByText("Закреплённые", { exact: true })).toBeVisible();
  await expect(sidebar.getByText(renamed, { exact: true })).toBeVisible();

  sidebar = await openThreadMenu(page, renamed);
  await sidebar.getByRole("button", { name: "Открепить", exact: true }).click();
  sidebar = await openThreadMenu(page, renamed);
  await sidebar.getByRole("button", { name: "В архив", exact: true }).click();

  sidebar = await openSidebar(page);
  await sidebar.getByRole("button", { name: "Архив", exact: true }).click();
  await expect(sidebar.getByText(renamed, { exact: true })).toBeVisible();
  sidebar = await openThreadMenu(page, renamed);
  await sidebar.getByRole("button", { name: "Восстановить", exact: true }).click();
  sidebar = await openSidebar(page);
  await sidebar.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(sidebar.getByText(renamed, { exact: true })).toBeVisible();

  sidebar = await openThreadMenu(page, renamed);
  await sidebar.getByRole("button", { name: "Удалить", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Удалить чат?" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  sidebar = await openSidebar(page);
  await expect(sidebar.getByText(renamed, { exact: true })).toHaveCount(0);

  await sidebar.getByRole("button", { name: "Новый чат", exact: true }).click();
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await expect(composer(page)).toBeEditable();

  expect(relevantErrors(runtimeErrors)).toEqual([]);
});
