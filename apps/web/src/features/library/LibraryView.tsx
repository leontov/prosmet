import type { AppView } from "@prosmet/contracts";
import { FileTextIcon, FolderKanbanIcon, PlusIcon, SearchIcon, TagIcon } from "lucide-react";
import { catalog, documents, projects } from "../../data/demo";

type Props = {
  view: Extract<AppView, "projects" | "estimates" | "documents" | "catalog">;
  mobile: boolean;
  onOpenEstimate: () => void;
};

const meta = {
  projects: { title: "Объекты", description: "Все объекты, диалоги и связанные документы", icon: <FolderKanbanIcon /> },
  estimates: { title: "Сметы", description: "Черновики, версии, утверждённые и переданные расчёты", icon: <FileTextIcon /> },
  documents: { title: "Документы", description: "Коммерческие предложения, договоры, акты и счета", icon: <FileTextIcon /> },
  catalog: { title: "Каталог цен", description: "Личные, организационные и региональные цены", icon: <TagIcon /> }
} as const;

export function LibraryView({ view, mobile, onOpenEstimate }: Props) {
  const content = view === "documents" ? documents : view === "catalog" ? catalog : projects;
  const info = meta[view];

  return (
    <section className={mobile ? "library mobile-library" : "library desktop-library"}>
      <header className="library-header">
        <div>
          <span className="library-icon">{info.icon}</span>
          <h1>{info.title}</h1>
          <p>{info.description}</p>
        </div>
        <button type="button" className="primary-button"><PlusIcon /> Создать</button>
      </header>

      <label className="library-search">
        <SearchIcon />
        <input id={`${view}-search`} name={`${view}-search`} placeholder={`Поиск: ${info.title.toLowerCase()}`} />
      </label>

      <div className="library-list">
        {content.map((item, index) => (
          <button type="button" key={item.title} className="library-row" onClick={view === "estimates" || view === "projects" ? onOpenEstimate : undefined}>
            <span className="library-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="library-row-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
            <b>{item.amount}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
