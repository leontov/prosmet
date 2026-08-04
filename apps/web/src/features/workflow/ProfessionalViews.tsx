import { useDeferredValue, useMemo, useState } from "react";
import type {
  ConstructionDocument,
  ConstructionProject,
  Estimate,
  PriceCatalogEntry
} from "@prosmet/contracts";
import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  FileCheck2Icon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  PlusIcon,
  SearchIcon,
  TrendingUpIcon
} from "lucide-react";

const projectStatusLabels: Record<ConstructionProject["status"], string> = {
  estimate_draft: "Черновик сметы",
  estimate_review: "Проверка сметы",
  estimate_sent: "На согласовании",
  estimate_approved: "Смета утверждена",
  proposal_ready: "КП и счёт",
  contract_ready: "Договор готов",
  contracted: "Договор подписан",
  in_progress: "Работы выполняются",
  completion_review: "Приёмка работ",
  completed: "Проект завершён"
};

const estimateStatusLabels: Record<Estimate["status"], string> = {
  draft: "Черновик",
  review: "Версия сохранена",
  sent: "Передана клиенту",
  approved: "Утверждена"
};

const documentTypeLabels: Record<ConstructionDocument["type"], string> = {
  "commercial-proposal": "Коммерческое предложение",
  invoice: "Счёт",
  contract: "Договор подряда",
  act: "Акт выполненных работ",
  "ks-2": "КС-2",
  "ks-3": "КС-3"
};

const documentStatusLabels: Record<ConstructionDocument["status"], string> = {
  draft: "Черновик",
  ready: "Готов",
  sent: "Передан",
  signed: "Подписан",
  approved: "Утверждён"
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function relativeDate(value: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const days = Math.floor((Date.now() - time) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return new Date(time).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function estimateTotal(estimate: Estimate) {
  const direct = estimate.sections.reduce(
    (total, section) => total + section.items.reduce(
      (subtotal, item) => subtotal + Math.max(0, item.quantity) * Math.max(0, item.unitPrice),
      0
    ),
    0
  );
  const overhead = direct * Math.max(0, estimate.overheadPercent) / 100;
  const profit = (direct + overhead) * Math.max(0, estimate.profitPercent) / 100;
  const vat = (direct + overhead + profit) * Math.max(0, estimate.vatPercent) / 100;
  return direct + overhead + profit + vat;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="pro-search-field">
      <SearchIcon />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function EmptyState({ icon, title, copy, action, actionLabel }: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="pro-empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
      {action && actionLabel ? <button type="button" onClick={action}><PlusIcon /> {actionLabel}</button> : null}
    </div>
  );
}

export function ProjectsView({ projects, mobile, onOpen, onCreate }: {
  projects: ConstructionProject[];
  mobile: boolean;
  onOpen: (project: ConstructionProject) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => projects.filter((project) =>
    !deferred || `${project.title} ${project.customer} ${project.region}`.toLowerCase().includes(deferred)
  ), [deferred, projects]);

  return (
    <section className={mobile ? "pro-view pro-view-mobile" : "pro-view"} data-testid="projects-view">
      <header className="pro-view-header">
        <div><h1>Проекты</h1><p>Объект, смета, договор, выполнение и закрывающие документы связаны в одном процессе.</p></div>
        <button type="button" className="pro-primary-action" onClick={onCreate}><PlusIcon /> Новый проект</button>
      </header>
      <SearchField value={query} onChange={setQuery} placeholder="Поиск проектов" />
      {rows.length ? (
        <div className="pro-project-list">
          {rows.map((project) => (
            <button type="button" key={project.id} className="pro-project-row" onClick={() => onOpen(project)}>
              <span className="pro-row-icon"><FolderKanbanIcon /></span>
              <span className="pro-project-copy">
                <strong>{project.title}</strong>
                <small>{[project.customer, project.region, relativeDate(project.updatedAt)].filter(Boolean).join(" · ")}</small>
                <span className="pro-stage"><i style={{ width: `${Math.max(4, project.progress.percent)}%` }} /><b>{projectStatusLabels[project.status]}</b></span>
              </span>
              <span className="pro-project-summary">
                <strong>{money(project.totals.estimate)}</strong>
                <small>{project.progress.completedItems}/{project.progress.totalItems} позиций · {project.progress.percent}%</small>
              </span>
              <ArrowUpRightIcon />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={<FolderKanbanIcon />} title={query ? "Проекты не найдены" : "Создайте первый проект"} copy={query ? "Измените поисковый запрос." : "Проект появится автоматически вместе с первой полноценной сметой."} action={onCreate} actionLabel="Открыть чат" />
      )}
    </section>
  );
}

export function EstimatesView({ estimates, mobile, onOpen, onCreate }: {
  estimates: Estimate[];
  mobile: boolean;
  onOpen: (estimate: Estimate) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => [...estimates]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .filter((estimate) => !deferred || `${estimate.title} ${estimate.project} ${estimate.region}`.toLowerCase().includes(deferred)), [deferred, estimates]);

  return (
    <section className={mobile ? "pro-view pro-view-mobile" : "pro-view"} data-testid="estimates-view">
      <header className="pro-view-header">
        <div><h1>Сметы</h1><p>Редактируемые расчёты, неизменяемые версии и статусы согласования.</p></div>
        <button type="button" className="pro-primary-action" onClick={onCreate}><PlusIcon /> Составить смету</button>
      </header>
      <SearchField value={query} onChange={setQuery} placeholder="Поиск смет" />
      {rows.length ? (
        <div className="pro-data-list">
          {rows.map((estimate) => (
            <button type="button" key={estimate.id} className="pro-data-row history-item" onClick={() => onOpen(estimate)}>
              <span className="pro-row-icon"><FileSpreadsheetIcon /></span>
              <span><strong>{estimate.title}</strong><small>{[estimate.project, estimate.region, `Версия ${estimate.revision}`].filter(Boolean).join(" · ")}</small></span>
              <span className={`pro-status pro-status-${estimate.status}`}>{estimateStatusLabels[estimate.status]}</span>
              <b>{money(estimateTotal(estimate))}</b>
              <ArrowUpRightIcon />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={<FileSpreadsheetIcon />} title={query ? "Сметы не найдены" : "Смет пока нет"} copy={query ? "Измените поисковый запрос." : "Опишите строительную задачу в чате. Редактор откроется только после готового расчёта."} action={onCreate} actionLabel="Составить смету" />
      )}
    </section>
  );
}

export function DocumentsView({ documents, mobile, onOpen, onCreate }: {
  documents: ConstructionDocument[];
  mobile: boolean;
  onOpen: (document: ConstructionDocument) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => documents.filter((document) =>
    !deferred || `${document.title} ${document.number} ${documentTypeLabels[document.type]}`.toLowerCase().includes(deferred)
  ), [deferred, documents]);

  return (
    <section className={mobile ? "pro-view pro-view-mobile" : "pro-view"} data-testid="documents-view">
      <header className="pro-view-header">
        <div><h1>Документы</h1><p>КП, счёт, договор, акт, КС-2 и КС-3 создаются из зафиксированных данных проекта.</p></div>
      </header>
      <SearchField value={query} onChange={setQuery} placeholder="Поиск документов" />
      {rows.length ? (
        <div className="pro-document-grid">
          {rows.map((document) => (
            <button type="button" key={document.id} className="pro-document-card" onClick={() => onOpen(document)}>
              <span className="pro-document-icon">{document.status === "signed" || document.status === "approved" ? <FileCheck2Icon /> : <FileTextIcon />}</span>
              <span><small>{document.number}</small><strong>{documentTypeLabels[document.type]}</strong><p>{document.title.replace(`${documentTypeLabels[document.type]} · `, "")}</p></span>
              <footer><span className={`pro-status pro-document-${document.status}`}>{documentStatusLabels[document.status]}</span><time>{relativeDate(document.updatedAt)}</time></footer>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState icon={<FileTextIcon />} title={query ? "Документы не найдены" : "Документы появятся по процессу"} copy={query ? "Измените поисковый запрос." : "Сначала сохраните и согласуйте смету. Затем сформируйте КП, счёт и договор в карточке проекта."} action={onCreate} actionLabel="Открыть проекты" />
      )}
    </section>
  );
}

export function PriceCatalogView({ prices, mobile, onRefresh }: {
  prices: PriceCatalogEntry[];
  mobile: boolean;
  onRefresh: (query: string, region: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());
  const rows = useMemo(() => prices.filter((entry) =>
    !deferred || `${entry.name} ${entry.unit} ${entry.region} ${entry.category}`.toLowerCase().includes(deferred)
  ), [deferred, prices]);

  return (
    <section className={mobile ? "pro-view pro-view-mobile" : "pro-view"} data-testid="prices-view">
      <header className="pro-view-header">
        <div><h1>Справочник цен</h1><p>Региональные наблюдения из ИИ-исследований, пользовательских правок и утверждённых смет.</p></div>
        <button type="button" className="pro-secondary-action" onClick={() => onRefresh(query, region)}><TrendingUpIcon /> Сверить</button>
      </header>
      <div className="pro-price-filters">
        <SearchField value={query} onChange={setQuery} placeholder="Работа или материал" />
        <label><span>Регион</span><input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Например, Татарстан" /></label>
      </div>
      {rows.length ? (
        <div className="pro-price-table" role="table" aria-label="Справочник региональных цен">
          <div className="pro-price-head" role="row"><span>Позиция</span><span>Регион</span><span>Медиана</span><span>Средняя</span><span>Выборка</span><span>Обновлено</span></div>
          {rows.map((entry) => (
            <div className="pro-price-row" role="row" key={`${entry.normalizedName}:${entry.unit}:${entry.region}`}>
              <span><strong>{entry.name}</strong><small>{entry.category} · за {entry.unit}</small></span>
              <span>{entry.region || "Не указан"}</span>
              <b>{money(entry.medianPrice)}<small>/{entry.unit}</small></b>
              <span>{money(entry.averagePrice)}</span>
              <span>{entry.sampleCount}</span>
              <time><CalendarClockIcon /> {new Date(entry.latestObservedAt).toLocaleDateString("ru-RU")}</time>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<TrendingUpIcon />} title="Справочник ещё формируется" copy="После создания и утверждения смет здесь появятся региональные цены с размером выборки и датой наблюдения." />
      )}
      <div className="pro-price-methodology"><CheckCircle2Icon /><span><strong>Как используется справочник</strong><small>ИИ получает медиану и среднее значение как ориентир, затем сверяет их со свежими коммерческими источниками. Утверждённые цены имеют повышенный вес.</small></span></div>
    </section>
  );
}

export const workflowLabels = {
  projectStatusLabels,
  estimateStatusLabels,
  documentTypeLabels,
  documentStatusLabels
};
