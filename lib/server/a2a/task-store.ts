import "server-only";

import { randomUUID } from "node:crypto";
import { buildDevelopmentPlan, type DevelopmentPlan } from "@/lib/server/a2a/registry";

export type DeveloperTaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "canceled"
  | "failed";

export type DeveloperTask = {
  id: string;
  contextId: string;
  status: {
    state: DeveloperTaskState;
    timestamp: string;
    message?: {
      role: "agent";
      messageId: string;
      parts: Array<{ kind: "text"; text: string }>;
    };
  };
  artifacts: Array<{
    artifactId: string;
    name: string;
    description: string;
    parts: Array<
      | { kind: "text"; text: string }
      | { kind: "data"; data: DevelopmentPlan }
    >;
  }>;
  history: Array<{
    role: "user" | "agent";
    messageId: string;
    parts: Array<{ kind: "text"; text: string }>;
  }>;
  metadata: {
    executionMode: "plan";
    requestedPermission: DevelopmentPlan["requestedPermission"];
    selectedAgentIds: string[];
    ownerApprovalRequired: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

type StoredDeveloperTask = DeveloperTask & { ownerId: string };

type TaskGlobals = typeof globalThis & {
  __prosmetA2ADeveloperTasks?: Map<string, StoredDeveloperTask>;
};

const taskGlobals = globalThis as TaskGlobals;
const taskStore =
  taskGlobals.__prosmetA2ADeveloperTasks ??
  (taskGlobals.__prosmetA2ADeveloperTasks = new Map<string, StoredDeveloperTask>());

function publicTask(task: StoredDeveloperTask): DeveloperTask {
  const { ownerId: _ownerId, ...result } = task;
  return structuredClone(result);
}

function taskKey(ownerId: string, taskId: string) {
  return `${ownerId}:${taskId}`;
}

function planText(plan: DevelopmentPlan) {
  const stages = plan.stages
    .map((stage, index) => `${index + 1}. ${stage.title} — ${stage.ownerAgentId}`)
    .join("\n");
  return [
    `Задача: ${plan.summary}`,
    "",
    `Команда: ${plan.selectedAgentIds.join(", ")}`,
    `Запрошенное разрешение: ${plan.requestedPermission}`,
    "",
    "План выпуска:",
    stages,
    "",
    "Следующий шаг: подтвердить план в чате. Операции code/git/deploy выполняются только через отдельный owner-approved execution adapter."
  ].join("\n");
}

export function createDeveloperTask(input: {
  ownerId: string;
  prompt: string;
  contextId?: string;
}) {
  const now = new Date().toISOString();
  const taskId = randomUUID();
  const contextId = input.contextId?.trim() || randomUUID();
  const plan = buildDevelopmentPlan(input.prompt);
  const responseText = planText(plan);
  const task: StoredDeveloperTask = {
    id: taskId,
    contextId,
    ownerId: input.ownerId,
    status: {
      state: "completed",
      timestamp: now,
      message: {
        role: "agent",
        messageId: randomUUID(),
        parts: [{ kind: "text", text: responseText }]
      }
    },
    artifacts: [
      {
        artifactId: randomUUID(),
        name: "development-plan",
        description: "Проверяемый план разработки и выпуска Просметчика",
        parts: [
          { kind: "text", text: responseText },
          { kind: "data", data: plan }
        ]
      }
    ],
    history: [
      {
        role: "user",
        messageId: randomUUID(),
        parts: [{ kind: "text", text: input.prompt }]
      },
      {
        role: "agent",
        messageId: randomUUID(),
        parts: [{ kind: "text", text: responseText }]
      }
    ],
    metadata: {
      executionMode: "plan",
      requestedPermission: plan.requestedPermission,
      selectedAgentIds: plan.selectedAgentIds,
      ownerApprovalRequired: ["code", "git", "deploy"].includes(plan.requestedPermission),
      createdAt: now,
      updatedAt: now
    }
  };
  taskStore.set(taskKey(input.ownerId, taskId), task);
  return publicTask(task);
}

export function getDeveloperTask(ownerId: string, taskId: string) {
  const task = taskStore.get(taskKey(ownerId, taskId));
  return task ? publicTask(task) : null;
}

export function listDeveloperTasks(ownerId: string) {
  return [...taskStore.values()]
    .filter((task) => task.ownerId === ownerId)
    .sort((left, right) => right.metadata.updatedAt.localeCompare(left.metadata.updatedAt))
    .map(publicTask);
}

export function cancelDeveloperTask(ownerId: string, taskId: string) {
  const key = taskKey(ownerId, taskId);
  const current = taskStore.get(key);
  if (!current) return null;
  const now = new Date().toISOString();
  const next: StoredDeveloperTask = {
    ...current,
    status: {
      state: "canceled",
      timestamp: now,
      message: {
        role: "agent",
        messageId: randomUUID(),
        parts: [{ kind: "text", text: "A2A-задача отменена владельцем рабочего пространства." }]
      }
    },
    metadata: { ...current.metadata, updatedAt: now }
  };
  taskStore.set(key, next);
  return publicTask(next);
}

export function resetDeveloperTasksForTest() {
  taskStore.clear();
}
