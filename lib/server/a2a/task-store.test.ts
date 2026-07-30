import { afterEach, describe, expect, it } from "vitest";
import {
  cancelDeveloperTask,
  createDeveloperTask,
  getDeveloperTask,
  listDeveloperTasks,
  resetDeveloperTasksForTest
} from "@/lib/server/a2a/task-store";

afterEach(() => resetDeveloperTasksForTest());

describe("A2A developer task store", () => {
  it("creates a development plan with selected agents", () => {
    const task = createDeveloperTask({
      ownerId: "owner:alpha",
      prompt: "Исправь мобильный редактор сметы и проверь его в Chromium"
    });
    expect(task.status.state).toBe("completed");
    expect(task.metadata.selectedAgentIds).toContain("mobile");
    expect(task.metadata.selectedAgentIds).toContain("qa");
    expect(task.artifacts[0]?.name).toBe("development-plan");
  });

  it("isolates tasks between owners", () => {
    const task = createDeveloperTask({
      ownerId: "owner:alpha",
      prompt: "Проверь backend"
    });
    expect(getDeveloperTask("owner:alpha", task.id)?.id).toBe(task.id);
    expect(getDeveloperTask("owner:beta", task.id)).toBeNull();
    expect(listDeveloperTasks("owner:beta")).toEqual([]);
  });

  it("supports explicit cancellation", () => {
    const task = createDeveloperTask({
      ownerId: "owner:alpha",
      prompt: "Подготовь релиз"
    });
    const canceled = cancelDeveloperTask("owner:alpha", task.id);
    expect(canceled?.status.state).toBe("canceled");
    expect(getDeveloperTask("owner:alpha", task.id)?.status.state).toBe("canceled");
  });
});
