import type { AppView, Estimate } from "@prosmet/contracts";
import { FileTextIcon, FolderKanbanIcon, PlusIcon, SearchIcon, TagIcon } from "lucide-react";
import { calculateEstimate, formatMoney } from "../../lib/estimate";

type Props = {
  view: Extract<AppView, "projects" | "estimates" | "documents" | "catalog">;
  mobile: boolean;
  estimate: Estimate | null;
  onOpenEstimate: () => void;
  onCreate: () => void;
};

const meta = {
  projects: { title: "Объекты", description: "Все объекты, диалоги и связанные документы", icon: <FolderKanbanIcon /> },
  estimates: { title: "Сметы", description: "Черновики, версии, утверждённые и переданные расчёты", icon: <FileTextIcon /> },
  documents: { title: "Документы", description: "Коммерческие предложения, договоры, акты и счета", icon: <FileTextIcon /> },
  catalog: { title: "Каталог цен", description: "Личные, организационные и региональные цены", icon: <TagIcon /> }
} as const;

export function LibraryView({ view, mobile, estimate, onOpenEstimate, onCreate }: Props) {
  const info = meta[view];
  const calculation = estimate ? calculateEstimate(estimate) : null;
  const hasEstimateRow = Boolean(estimate && (view === "projects" || view === "estimates"));

  return (
    <section className={mobile ? "library mobile-library" : "library desktop-library"}>
      <header className="library-header">
        <div>
          <span className="library-icon">{info.icon}</span>
          <h1>{info.title}</h1>
          <p>{info.description}</p>
        </div>
        <button type="button" className="primary-button" onClick={onCreate}><PlusIcon /> Создать через чат</button>
      </header>

      <label className="library-search">
        <SearchIcon />
        <input id={`${view}-search`} name={`${view}-search`} placeholder={`Поиск: ${info.title.toLowerCase()}`} disabled={!hasEstimateRow} />
      </label>

      <div className="library-list">
        {hasEstimateRow && estimate ? (
          <button type="button" className="library-row" onClick={onOpenEstimate}>
            <span className="library-number">01</span>
            <span className="library-row-copy">
              <strong>{view === "projects" ? estimate.project || estimate.title : estimate.title}</strong>
              <small>{estimate.region || "Регион не указан"} · версия {estimate.revision} · {statusLabel(estimate.status)}</small>
            </span>
            <b>{calculation ? formatMoney(calculation.total) : "—"}</b>
          </button>
        ) : (
          <div className="library-empty-state">
            <span>{info.icon}</span>
            <strong>{emptyTitle(view)}</strong>
            <p>{emptyDescription(view)}</p>
            <button type="button" className="secondary-button" onClick={onCreate}><PlusIcon /> Перейти в чат</button>
          </div>
        )}
      </div>
    </section>
  );
}

function statusLabel(status: Estimate["status"]) {
  if (status === "approved") return "утверждена";
  if (status === "sent") return "передана клиенту";
  if (status === "review") return "сохранена";
  return "черновик";
}

function emptyTitle(view: Props["view"]) {
  if (view === "documents") return "Документы ещё не созданы";
  if (view === "catalog") return "Каталог пока пуст";
  if (view === "projects") return "Объекты появятся после первого расчёта";
  return "Сметы появятся после первого расчёта";
}

function emptyDescription(view: Props["view"]) {
  if (view === "documents") return "Попросите подключённого агента подготовить КП, договор, акт или счёт. Здесь будут отображаться только реально созданные документы.";
  if (view === "catalog") return "Подтверждённые цены появятся после утверждения реальных смет и подключения источников данных.";
  return "Начните диалог с подключённым агентом. Демонстрационные строки и фиктивные суммы удалены.";
}
