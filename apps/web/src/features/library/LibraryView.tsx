import { useMemo, useState } from "react";
import type { AppView, Estimate, EstimateItem } from "@prosmet/contracts";
import { FileTextIcon, FolderKanbanIcon, PlusIcon, SearchIcon, TagIcon } from "lucide-react";
import { calculateEstimate, formatMoney } from "../../lib/estimate";

type LibraryViewName = Extract<AppView, "projects" | "estimates" | "documents" | "catalog">;

type Props = {
  view: LibraryViewName;
  mobile: boolean;
  estimates: Estimate[];
  onCreate: () => void;
  onOpenEstimate: (id?: string) => void;
};

type Row = {
  id: string;
  title: string;
  meta: string;
  amount: string;
  estimateId?: string;
};

const meta = {
  projects: { title: "Объекты", description: "Объекты, созданные из фактических смет", icon: <FolderKanbanIcon /> },
  estimates: { title: "Сметы", description: "Черновики, версии, утверждённые и переданные расчёты", icon: <FileTextIcon /> },
  documents: { title: "Документы", description: "Коммерческие предложения, договоры, акты и счета", icon: <FileTextIcon /> },
  catalog: { title: "Каталог цен", description: "Цены из сохранённых пользователем расчётов", icon: <TagIcon /> }
} as const;

const statusLabels: Record<Estimate["status"], string> = {
  draft: "Черновик",
  review: "Версия сохранена",
  approved: "Утверждена",
  sent: "Передана клиенту"
};

function estimateRows(estimates: Estimate[]): Row[] {
  return [...estimates]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .map((estimate) => ({
      id: estimate.id,
      estimateId: estimate.id,
      title: estimate.title,
      meta: [estimate.project, estimate.region, statusLabels[estimate.status]].filter(Boolean).join(" · "),
      amount: formatMoney(calculateEstimate(estimate).total)
    }));
}

function projectRows(estimates: Estimate[]): Row[] {
  const projects = new Map<string, { estimates: Estimate[]; total: number }>();
  for (const estimate of estimates) {
    const key = estimate.project.trim() || "Объект без названия";
    const entry = projects.get(key) || { estimates: [], total: 0 };
    entry.estimates.push(estimate);
    entry.total += calculateEstimate(estimate).total;
    projects.set(key, entry);
  }
  return [...projects.entries()].map(([title, entry]) => {
    const latest = [...entry.estimates].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
    return {
      id: `project:${title}`,
      estimateId: latest.id,
      title,
      meta: `${entry.estimates.length} ${entry.estimates.length === 1 ? "смета" : "сметы"}${latest.region ? ` · ${latest.region}` : ""}`,
      amount: formatMoney(entry.total)
    };
  });
}

function catalogRows(estimates: Estimate[]): Row[] {
  const entries = new Map<string, { item: EstimateItem; estimate: Estimate }>();
  for (const estimate of [...estimates].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))) {
    for (const section of estimate.sections) {
      for (const item of section.items) {
        const key = `${item.name.toLowerCase()}::${item.unit.toLowerCase()}`;
        if (!entries.has(key)) entries.set(key, { item, estimate });
      }
    }
  }
  return [...entries.entries()].map(([id, { item, estimate }]) => ({
    id: `catalog:${id}`,
    estimateId: estimate.id,
    title: item.name,
    meta: `${item.category} · ${estimate.region || "регион не указан"} · ${new Date(estimate.updatedAt).toLocaleDateString("ru-RU")}`,
    amount: `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(item.unitPrice)} ₽/${item.unit}`
  }));
}

function rowsFor(view: LibraryViewName, estimates: Estimate[]) {
  if (view === "estimates") return estimateRows(estimates);
  if (view === "projects") return projectRows(estimates);
  if (view === "catalog") return catalogRows(estimates);
  return [];
}

export function LibraryView({ view, mobile, estimates, onCreate, onOpenEstimate }: Props) {
  const [query, setQuery] = useState("");
  const info = meta[view];
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const source = rowsFor(view, estimates);
    if (!normalizedQuery) return source;
    return source.filter((item) => `${item.title} ${item.meta} ${item.amount}`.toLowerCase().includes(normalizedQuery));
  }, [estimates, query, view]);

  const emptyMessage = view === "documents"
    ? "Документы появятся после того, как агент сформирует их из утверждённой сметы."
    : query
      ? "Ничего не найдено. Измените поисковый запрос."
      : "Здесь пока нет данных. Создайте первый расчёт в чате.";

  return (
    <section className={mobile ? "library mobile-library" : "library desktop-library"}>
      <header className="library-header">
        <div>
          <span className="library-icon">{info.icon}</span>
          <h1>{info.title}</h1>
          <p>{info.description}</p>
        </div>
        <button type="button" className="primary-button" onClick={onCreate}><PlusIcon /> Создать</button>
      </header>

      <label className="library-search">
        <SearchIcon />
        <input id={`${view}-search`} name={`${view}-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Поиск: ${info.title.toLowerCase()}`} />
      </label>

      {rows.length ? (
        <div className="library-list">
          {rows.map((item, index) => (
            <button type="button" key={item.id} className="library-row" onClick={item.estimateId ? () => onOpenEstimate(item.estimateId) : undefined}>
              <span className="library-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="library-row-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
              <b>{item.amount}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="library-empty-state">
          <span>{info.icon}</span>
          <strong>{emptyMessage}</strong>
          {view !== "documents" || estimates.length === 0 ? <button type="button" onClick={onCreate}>Открыть чат</button> : null}
        </div>
      )}
    </section>
  );
}
