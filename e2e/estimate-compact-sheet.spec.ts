import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

function composer(page: import("@playwright/test").Page) {
  return page.getByLabel("Сообщение Просметчику");
}

async function sendPrompt(page: import("@playwright/test").Page, prompt: string) {
  const input = composer(page);
  await expect(input).toBeEditable();
  await input.fill(prompt);
  const send = page.getByRole("button", { name: "Отправить" });
  await expect(send).toBeEnabled();
  await send.click();
}

test.beforeAll(async () => {
  await mkdir("artifacts/screenshots", { recursive: true });
});

test("owner can create an A2A development plan inside the chat", async ({
  page,
  request
}, testInfo) => {
  const cardResponse = await request.get("/.well-known/agent-card.json");
  expect(cardResponse.ok()).toBe(true);
  const agentCard = (await cardResponse.json()) as {
    protocolVersion?: string;
    url?: string;
    skills?: Array<{ id?: string }>;
  };
  expect(agentCard.protocolVersion).toBe("0.3.0");
  expect(agentCard.url).toContain("/api/a2a");
  expect(agentCard.skills?.some((skill) => skill.id === "develop-prosmet")).toBe(true);

  await page.goto("/");
  await expect(page.getByTestId("chat-empty-state")).toBeVisible();
  await sendPrompt(
    page,
    "Открой режим разработчика A2A и подключи команду ИИ-разработчиков для продолжения проекта"
  );

  const card = page.getByTestId("developer-workspace-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("Команда ИИ-разработчиков Просметчика");
  await card.getByRole("button").click();

  const dialog = page.getByRole("dialog", { name: "Режим разработчика" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Агенты/)).toBeVisible();
  const task = dialog.getByLabel("Задача команде разработчиков");
  await task.fill(
    "Переделай редактор сметы, проверь desktop и mobile, исправь CI и подготовь релиз на порт 3200"
  );
  await dialog.getByRole("button", { name: "Сформировать план" }).click();
  const plan = dialog.getByTestId("developer-task-plan");
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await expect(plan.getByText("План готов", { exact: true })).toBeVisible();
  await expect(plan.getByText(/право: deploy/)).toBeVisible();
  await expect(plan.getByText(/Проверить desktop, mobile/)).toBeVisible();

  await page.screenshot({
    path: `artifacts/screenshots/developer-workspace-${testInfo.project.name}.png`,
    fullPage: true
  });
});
