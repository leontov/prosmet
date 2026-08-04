import type { Estimate } from "@prosmet/contracts";

export type ProjectSummary = {
  id: string;
  title: string;
  updatedAt: string;
  estimates: Estimate[];
};

export function projectId(title: string) {
  return encodeURIComponent(title.trim().toLowerCase() || "untitled");
}

export function groupProjects(estimates: Estimate[]): ProjectSummary[] {
  const groups = new Map<string, Estimate[]>();
  for (const estimate of estimates) {
    const title = estimate.project.trim() || "Объект без названия";
    const entry = groups.get(title) || [];
    entry.push(estimate);
    groups.set(title, entry);
  }

  return [...groups.entries()]
    .map(([title, items]) => {
      const sorted = [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      return {
        id: projectId(title),
        title,
        updatedAt: sorted[0]?.updatedAt || new Date(0).toISOString(),
        estimates: sorted
      };
    })
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function formatRelativeDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Дата не указана";
  const now = Date.now();
  const difference = Math.max(0, now - timestamp);
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 день назад";
  if (days < 7) return `${days} дня назад`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 неделю назад";
  if (weeks < 5) return `${weeks} недели назад`;
  return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function statusLabel(status: Estimate["status"]) {
  if (status === "approved") return "Утверждена";
  if (status === "review") return "Версия сохранена";
  if (status === "sent") return "Передана клиенту";
  return "Черновик";
}
