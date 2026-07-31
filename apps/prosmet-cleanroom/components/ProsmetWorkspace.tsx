"use client";

import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  ClipboardCheckIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HistoryIcon,
  MenuIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PanelRightIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  Settings2Icon,
  Share2Icon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  XIcon
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState
} from "react";

type View = "chat" | "objects" | "estimates" | "documents" | "prices" | "profile";
type EstimateStatus = "draft" | "saved" | "approved" | "sent";

type EstimateLine = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  hasEstimate?: boolean;
};

const suggestions = [
  {
    title: "Штукатурка 358 м²",
    description: "Технологическая карта, материалы, работа и логистика",
    prompt: "Составь смету механизированной гипсовой штукатурки 358 м² в Лениногорске, слой 15 мм."
  },
  {
    title: "Кровля 160 м²",
    description: "Демонтаж, основание, покрытие и доборные элементы",
    prompt: "Составь смету замены кровли 160 м² в Казани с демонтажем и новым покрытием."
  },
  {
    title: "Отопление дома",
    description: "Оборудование, монтаж, испытания и запуск системы",
    prompt: "Подготовь смету отопления частного дома 160 м² в Альметьевске."
  },
  {
    title: "Смета и документы",
    description: "КП, договор, счёт и акт из одной утверждённой версии",
    prompt: "Создай смету ремонта помещения 80 м² и комплект документов к ней."
  }
];

const initialLines: EstimateLine[] = [
  { id: "line-1", name: "Защита окон, дверей и чистовых поверхностей", unit: "м²", quantity: 86, unitPrice: 92 },
  { id: "line-2", name: "Грунтование основания составом глубокого проникновения", unit: "м²", quantity: 358, unitPrice: 78 },
  { id: "line-3", name: "Монтаж маячкового профиля и углов ПВХ", unit: "м.п.", quantity: 164, unitPrice: 165 },
  { id: "line-4", name: "Механизированное нанесение гипсовой штукатурки, слой 15 мм", unit: "м²", quantity: 358, unitPrice: 940 },
  { id: "line-5", name: "Доставка, подъём материалов и уборка зоны работ", unit: "компл.", quantity: 1, unitPrice: 39000 }
];

const navigation: Array<{ view: View; label: string; icon: ReactNode }> = [
  { view: "chat", label: "Чаты", icon: <MessageSquareTextIcon /> },
  { view: "objects", label: "Объекты", icon: <FolderKanbanIcon /> },
  { view: "estimates", label: "Сметы", icon: <FileSpreadsheetIcon /> },
  { view: "documents", label: "Документы", icon: <FileTextIcon /> },
  { view: "prices", label: "Цены", icon: <TagIcon /> }
];

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

function formatMoney(value: number) {
  return money.format(value);
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProsmetWorkspace() {
  const [view, setView] = useState<View>("chat");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimatePreview, setEstimatePreview] = useState(false);
  const [estimateStatus, setEstimateStatus] = useState<EstimateStatus>("draft");
  const [revision, setRevision] = useState(1);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lines, setLines] = useState<EstimateLine[]>(initialLines);
  const [objectName, setObjectName] = useState("Квартира, Лениногорск");
  const [customer, setCustomer] = useState("Иван Петров");
  const [region, setRegion] = useState("Республика Татарстан");
  const [estimateDate, setEstimateDate] = useState("2026-07-31");
  const pendingTimer = useRef<number | null>(null);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
    [lines]
  );

  const activeLine = lines.find((line) => line.id === activeLineId) ?? null;

  const navigate = (next: View) => {
    setView(next);
    setHistoryOpen(false);
  };

  const sendMessage = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = composer.trim();
    if (!prompt || generating) return;

    setMessages((current) => [
      ...current,
      { id: nextId("user"), role: "user", text: prompt }
    ]);
    setComposer("");
    setGenerating(true);

    if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
    pendingTimer.current = window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: nextId("assistant"),
          role: "assistant",
          text: "Сформировал технологическую карту, проверил обязательные операции и собрал редактируемую смету.",
          hasEstimate: true
        }
      ]);
      setGenerating(false);
    }, 520);
  };

  const updateLine = (id: string, patch: Partial<EstimateLine>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
    if (estimateStatus !== "draft") setEstimateStatus("draft");
  };

  const addLine = () => {
    const id = nextId("line");
    setLines((current) => [
      ...current,
      { id, name: "Новая позиция", unit: "шт.", quantity: 1, unitPrice: 0 }
    ]);
    setActiveLineId(id);
  };

  const deleteLine = (id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
    setActiveLineId(null);
  };

  const saveVersion = () => {
    setRevision((current) => current + 1);
    setEstimateStatus("saved");
    setEstimatePreview(true);
  };

  const approveEstimate = () => {
    setEstimateStatus("approved");
    setEstimatePreview(true);
  };

  const exportCsv = () => {
    const rows = [
      ["Наименование", "Единица", "Количество", "Цена", "Сумма"],
      ...lines.map((line) => [
        line.name,
        line.unit,
        String(line.quantity),
        String(line.unitPrice),
        String(line.quantity * line.unitPrice)
      ])
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prosmet-estimate-v${revision}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const shareEstimate = async () => {
    const summary = `Смета: Механизированная штукатурка 358 м²\nИтого: ${formatMoney(total)}\nВерсия: ${revision}`;
    if (navigator.share) {
      await navigator.share({ title: "Смета Просмет", text: summary });
    } else {
      await navigator.clipboard.writeText(summary);
    }
    setEstimateStatus("sent");
  };

  return (
    <div className="cr-app-shell">
      <div className="cr-desktop-sidebar">
        <Sidebar view={view} onNavigate={navigate} />
      </div>

      {historyOpen ? (
        <div className="cr-mobile-drawer" role="dialog" aria-modal="true" aria-label="История и разделы">
          <button type="button" className="cr-drawer-scrim" aria-label="Закрыть историю" onClick={() => setHistoryOpen(false)} />
          <div className="cr-drawer-panel">
            <button type="button" className="cr-drawer-close" aria-label="Закрыть историю" onClick={() => setHistoryOpen(false)}>
              <XIcon />
            </button>
            <Sidebar view={view} onNavigate={navigate} />
          </div>
        </div>
      ) : null}

      <main className="cr-main">
        <header className="cr-topbar">
          <div className="cr-topbar-leading">
            <button type="button" className="cr-icon-button cr-mobile-only" aria-label="Открыть историю" onClick={() => setHistoryOpen(true)}>
              <MenuIcon />
            </button>
            <div className="cr-title-block">
              <strong>{view === "chat" ? "Новый чат" : navigation.find((item) => item.view === view)?.label ?? "Профиль"}</strong>
              <span>{view === "chat" ? "Смета, расчёт и документы в одном диалоге" : "Рабочий раздел Просмета"}</span>
            </div>
          </div>
          <div className="cr-topbar-actions">
            <button type="button" className="cr-icon-button" aria-label="Рабочий контекст" onClick={() => setInspectorOpen(true)}>
              <PanelRightIcon />
            </button>
            <button type="button" className="cr-icon-button" aria-label="Настройки" onClick={() => navigate("profile")}>
              <Settings2Icon />
            </button>
          </div>
        </header>

        <section className="cr-surface">
          {view === "chat" ? (
            <ChatCanvas
              messages={messages}
              composer={composer}
              generating={generating}
              onComposerChange={setComposer}
              onSend={sendMessage}
              onSuggestion={setComposer}
              onOpenEstimate={() => setEstimateOpen(true)}
            />
          ) : (
            <LibrarySurface view={view} onOpenEstimate={() => setEstimateOpen(true)} />
          )}
        </section>

        <MobileNavigation view={view} onNavigate={navigate} />
      </main>

      {inspectorOpen ? (
        <div className="cr-inspector-layer" role="dialog" aria-modal="true" aria-label="Рабочий контекст">
          <button type="button" className="cr-inspector-scrim" aria-label="Закрыть контекст" onClick={() => setInspectorOpen(false)} />
          <aside className="cr-inspector">
            <header>
              <div>
                <strong>Рабочий контекст</strong>
                <span>Подключения и состояние проекта</span>
              </div>
              <button type="button" className="cr-icon-button" aria-label="Закрыть контекст" onClick={() => setInspectorOpen(false)}><XIcon /></button>
            </header>
            <div className="cr-inspector-list">
              <StatusRow label="Локальная база" value="IndexedDB готова" />
              <StatusRow label="Серверная база" value="PostgreSQL подключён" />
              <StatusRow label="Расчётный движок" value="Rust 1.0" />
              <StatusRow label="Синхронизация" value="Outbox активен" />
            </div>
          </aside>
        </div>
      ) : null}

      {estimateOpen ? (
        <EstimateWorkspace
          lines={lines}
          total={total}
          revision={revision}
          status={estimateStatus}
          preview={estimatePreview}
          activeLine={activeLine}
          objectName={objectName}
          customer={customer}
          region={region}
          estimateDate={estimateDate}
          onObjectNameChange={setObjectName}
          onCustomerChange={setCustomer}
          onRegionChange={setRegion}
          onDateChange={setEstimateDate}
          onClose={() => {
            setEstimateOpen(false);
            setActiveLineId(null);
          }}
          onEdit={() => setEstimatePreview(false)}
          onSave={saveVersion}
          onApprove={approveEstimate}
          onShare={() => void shareEstimate()}
          onPrint={() => window.print()}
          onExportCsv={exportCsv}
          onAddLine={addLine}
          onOpenLine={setActiveLineId}
          onCloseLine={() => setActiveLineId(null)}
          onUpdateLine={updateLine}
          onDeleteLine={deleteLine}
        />
      ) : null}
    </div>
  );
}

function Sidebar({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return (
    <aside className="cr-sidebar" data-testid="cleanroom-sidebar">
      <div className="cr-brand-row">
        <button type="button" className="cr-brand" onClick={() => onNavigate("chat")}>
          <span className="cr-brand-mark"><SparklesIcon /></span>
          <span><strong>Просмет</strong><small>AI-сметная среда</small></span>
        </button>
      </div>

      <div className="cr-sidebar-primary">
        <button type="button" className="cr-new-chat" onClick={() => onNavigate("chat")}>
          <PlusIcon />
          Новый чат
        </button>
      </div>

      <nav className="cr-sidebar-nav" aria-label="Рабочие разделы">
        {navigation.map((item) => (
          <button key={item.view} type="button" className={view === item.view ? "is-active" : ""} onClick={() => onNavigate(item.view)}>
            {item.icon}
            <span>{item.label}</span>
            {view === item.view ? <ChevronRightIcon className="cr-nav-chevron" /> : null}
          </button>
        ))}
      </nav>

      <div className="cr-history-heading">
        <div><strong>Недавние</strong><span>Продолжите работу</span></div>
        <ArchiveIcon />
      </div>

      <label className="cr-search">
        <SearchIcon />
        <input aria-label="Поиск по чатам" placeholder="Найти чат" />
      </label>

      <div className="cr-history-list">
        <button type="button" className="is-active" onClick={() => onNavigate("chat")}>
          <HistoryIcon />
          <span><strong>Штукатурка 358 м²</strong><small>Лениногорск</small></span>
          <MoreHorizontalIcon />
        </button>
        <button type="button" onClick={() => onNavigate("chat")}>
          <MessageSquareTextIcon />
          <span><strong>Отопление частного дома</strong><small>Альметьевск</small></span>
          <MoreHorizontalIcon />
        </button>
      </div>

      <button type="button" className="cr-account" onClick={() => onNavigate("profile")}>
        <span className="cr-avatar"><CircleUserRoundIcon /></span>
        <span><strong>Организация Просмет</strong><small>Профиль и реквизиты</small></span>
        <Settings2Icon />
      </button>
    </aside>
  );
}

function ChatCanvas({
  messages,
  composer,
  generating,
  onComposerChange,
  onSend,
  onSuggestion,
  onOpenEstimate
}: {
  messages: ChatMessage[];
  composer: string;
  generating: boolean;
  onComposerChange: (value: string) => void;
  onSend: (event?: FormEvent) => void;
  onSuggestion: (value: string) => void;
  onOpenEstimate: () => void;
}) {
  return (
    <div className="cr-chat-canvas" data-testid="cleanroom-chat-canvas">
      <div className="cr-thread-scroll">
        {messages.length === 0 ? (
          <div className="cr-empty-state" data-testid="cleanroom-empty-state">
            <div className="cr-empty-mark"><SparklesIcon /></div>
            <h1>Что нужно посчитать?</h1>
            <p>Опишите объект и работы обычными словами. Просмет соберёт технологию, ресурсы, цены и документы.</p>
            <div className="cr-suggestion-grid">
              {suggestions.map((suggestion) => (
                <button key={suggestion.title} type="button" className="cr-suggestion-card" onClick={() => onSuggestion(suggestion.prompt)}>
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.description}</span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="cr-message-list">
            {messages.map((message) => (
              <article key={message.id} className={`cr-message cr-message-${message.role}`}>
                {message.role === "assistant" ? <div className="cr-assistant-avatar"><SparklesIcon /></div> : null}
                <div className="cr-message-body">
                  <p>{message.text}</p>
                  {message.hasEstimate ? (
                    <button type="button" className="cr-estimate-artifact" onClick={onOpenEstimate}>
                      <span className="cr-artifact-icon"><FileSpreadsheetIcon /></span>
                      <span className="cr-artifact-copy">
                        <strong>Механизированная штукатурка — 358 м²</strong>
                        <small>5 позиций · редактируемая версия</small>
                      </span>
                      <span className="cr-artifact-total">449 000 ₽</span>
                      <ChevronRightIcon />
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {generating ? (
              <div className="cr-generating"><span /><span /><span /> Просмет собирает расчёт</div>
            ) : null}
          </div>
        )}
      </div>

      <form className="cr-composer-dock" onSubmit={onSend}>
        <div className="cr-composer">
          <textarea
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            aria-label="Сообщение Просмету"
            placeholder="Опишите объект, объём и работы…"
            rows={1}
          />
          <button type="submit" aria-label="Отправить" disabled={!composer.trim() || generating}>
            <SendIcon />
          </button>
        </div>
        <small>Enter — отправить · Shift+Enter — новая строка</small>
      </form>
    </div>
  );
}

function LibrarySurface({ view, onOpenEstimate }: { view: View; onOpenEstimate: () => void }) {
  const title = navigation.find((item) => item.view === view)?.label ?? "Профиль";
  return (
    <div className="cr-library">
      <header className="cr-library-head">
        <div><h1>{title}</h1><p>Рабочие данные без перегруженных панелей и служебного шума.</p></div>
        <button type="button" className="cr-primary-button"><PlusIcon /> Создать</button>
      </header>
      <div className="cr-library-list">
        <button type="button" onClick={onOpenEstimate}>
          <span className="cr-library-icon"><FileSpreadsheetIcon /></span>
          <span><strong>Механизированная штукатурка — 358 м²</strong><small>Лениногорск · версия 1 · сегодня</small></span>
          <strong>449 000 ₽</strong>
          <ChevronRightIcon />
        </button>
        <button type="button">
          <span className="cr-library-icon"><FolderKanbanIcon /></span>
          <span><strong>Частный дом, Альметьевск</strong><small>Отопление и инженерные сети</small></span>
          <strong>В работе</strong>
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

function MobileNavigation({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return (
    <nav className="cr-mobile-nav" aria-label="Основная навигация">
      {navigation.slice(0, 4).map((item) => (
        <button key={item.view} type="button" className={view === item.view ? "is-active" : ""} onClick={() => onNavigate(item.view)}>
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <button type="button" className={view === "profile" ? "is-active" : ""} onClick={() => onNavigate("profile")}>
        <CircleUserRoundIcon />
        <span>Профиль</span>
      </button>
    </nav>
  );
}

function EstimateWorkspace({
  lines,
  total,
  revision,
  status,
  preview,
  activeLine,
  objectName,
  customer,
  region,
  estimateDate,
  onObjectNameChange,
  onCustomerChange,
  onRegionChange,
  onDateChange,
  onClose,
  onEdit,
  onSave,
  onApprove,
  onShare,
  onPrint,
  onExportCsv,
  onAddLine,
  onOpenLine,
  onCloseLine,
  onUpdateLine,
  onDeleteLine
}: {
  lines: EstimateLine[];
  total: number;
  revision: number;
  status: EstimateStatus;
  preview: boolean;
  activeLine: EstimateLine | null;
  objectName: string;
  customer: string;
  region: string;
  estimateDate: string;
  onObjectNameChange: (value: string) => void;
  onCustomerChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onSave: () => void;
  onApprove: () => void;
  onShare: () => void;
  onPrint: () => void;
  onExportCsv: () => void;
  onAddLine: () => void;
  onOpenLine: (id: string) => void;
  onCloseLine: () => void;
  onUpdateLine: (id: string, patch: Partial<EstimateLine>) => void;
  onDeleteLine: (id: string) => void;
}) {
  const statusLabel = status === "approved" ? "Утверждена" : status === "sent" ? "Передана клиенту" : status === "saved" ? "Версия сохранена" : "Черновик";

  return (
    <div className="cr-estimate-layer" data-testid="cleanroom-estimate-layer">
      <section className="cr-estimate-shell" aria-label="Редактор сметы" data-testid="cleanroom-estimate-workspace">
        <header className="cr-estimate-topbar">
          <button type="button" className="cr-icon-button" aria-label="Закрыть редактор" onClick={onClose}><ArrowLeftIcon /></button>
          <div className="cr-estimate-title-copy">
            <strong>Механизированная штукатурка — 358 м²</strong>
            <span>Версия {revision} · {lines.length} позиций · {statusLabel}</span>
          </div>
          <div className="cr-estimate-topbar-actions">
            <button type="button" className="cr-icon-button" aria-label="Печать и PDF" onClick={onPrint}><FileTextIcon /></button>
            <button type="button" className="cr-icon-button" aria-label="Экспорт Excel" onClick={onExportCsv}><FileSpreadsheetIcon /></button>
          </div>
        </header>

        <div className="cr-estimate-layout">
          <main className="cr-estimate-scroll">
            {preview ? (
              <div className="cr-version-banner"><CheckIcon /><span><strong>Версия {revision} сохранена</strong><small>Расчёт зафиксирован. Его можно утвердить или передать клиенту.</small></span></div>
            ) : null}

            <article className="cr-document-canvas">
              <header className="cr-document-hero">
                <div><span>Смета</span><h1>Механизированная штукатурка — 358 м²</h1><p>{objectName}</p></div>
                <div className="cr-document-total"><span>Итого</span><strong>{formatMoney(total)}</strong></div>
              </header>

              <div className="cr-meta-grid">
                <label><span>Объект</span><input value={objectName} disabled={preview} onChange={(event) => onObjectNameChange(event.target.value)} /></label>
                <label><span>Заказчик</span><input value={customer} disabled={preview} onChange={(event) => onCustomerChange(event.target.value)} /></label>
                <label><span>Регион</span><input value={region} disabled={preview} onChange={(event) => onRegionChange(event.target.value)} /></label>
                <label><span>Дата</span><input type="date" value={estimateDate} disabled={preview} onChange={(event) => onDateChange(event.target.value)} /></label>
              </div>

              <div className="cr-desktop-table">
                <div className="cr-table-head"><span>№</span><span>Наименование</span><span>Ед.</span><span>Количество</span><span>Цена</span><span>Сумма</span><span /></div>
                {lines.map((line, index) => (
                  <div className="cr-table-row" key={line.id}>
                    <span>{index + 1}</span>
                    <input aria-label={`Наименование позиции ${index + 1}`} value={line.name} disabled={preview} onChange={(event) => onUpdateLine(line.id, { name: event.target.value })} />
                    <input aria-label={`Единица позиции ${index + 1}`} value={line.unit} disabled={preview} onChange={(event) => onUpdateLine(line.id, { unit: event.target.value })} />
                    <input aria-label={`Количество позиции ${index + 1}`} inputMode="decimal" value={line.quantity} disabled={preview} onChange={(event) => onUpdateLine(line.id, { quantity: Number(event.target.value) || 0 })} />
                    <input aria-label={`Цена позиции ${index + 1}`} inputMode="decimal" value={line.unitPrice} disabled={preview} onChange={(event) => onUpdateLine(line.id, { unitPrice: Number(event.target.value) || 0 })} />
                    <strong>{formatMoney(line.quantity * line.unitPrice)}</strong>
                    <button type="button" aria-label={`Удалить позицию ${line.name}`} disabled={preview} onClick={() => onDeleteLine(line.id)}><Trash2Icon /></button>
                  </div>
                ))}
              </div>

              <div className="cr-mobile-estimate-list">
                {lines.map((line, index) => (
                  <button key={line.id} type="button" className="cr-mobile-estimate-card" onClick={() => onOpenLine(line.id)}>
                    <span className="cr-line-number">{index + 1}</span>
                    <span className="cr-line-copy"><strong>{line.name}</strong><small>{line.quantity.toLocaleString("ru-RU")} {line.unit} × {formatMoney(line.unitPrice)}</small></span>
                    <strong>{formatMoney(line.quantity * line.unitPrice)}</strong>
                    <PencilIcon />
                  </button>
                ))}
              </div>

              {!preview ? <button type="button" className="cr-add-line" onClick={onAddLine}><PlusIcon /> Добавить позицию</button> : null}

              <details className="cr-technology-card">
                <summary><span><strong>Технологическая карта</strong><small>5 обязательных этапов работ</small></span><ChevronRightIcon /></summary>
                <ol>
                  <li>Защитить окна, двери, пол и примыкания.</li>
                  <li>Очистить и загрунтовать основание.</li>
                  <li>Установить маяки и угловые профили.</li>
                  <li>Нанести раствор механизированным способом и выровнять.</li>
                  <li>Подрезать, загладить поверхность и убрать рабочую зону.</li>
                </ol>
              </details>
            </article>
          </main>

          <aside className="cr-summary-rail" aria-label="Итоги сметы">
            <div className={`cr-status cr-status-${status}`}><span />{statusLabel}</div>
            <small>Итого по смете</small>
            <strong>{formatMoney(total)}</strong>
            <div className="cr-summary-lines">
              <span><small>Работы и материалы</small><strong>{formatMoney(total)}</strong></span>
              <span><small>Количество позиций</small><strong>{lines.length}</strong></span>
              <span><small>Версия</small><strong>{revision}</strong></span>
            </div>
            <div className="cr-summary-actions">
              {preview ? (
                <>
                  <button type="button" className="cr-primary-button" onClick={onApprove}><ClipboardCheckIcon /> Утвердить</button>
                  <button type="button" className="cr-secondary-button" onClick={onEdit}><PencilIcon /> Редактировать</button>
                </>
              ) : (
                <button type="button" className="cr-primary-button" onClick={onSave}><CheckIcon /> Сохранить версию</button>
              )}
              <button type="button" className="cr-secondary-button" onClick={onShare}><Share2Icon /> Передать клиенту</button>
            </div>
            <p>Сохранение, утверждение и передача клиенту остаются отдельными действиями.</p>
          </aside>
        </div>

        <div className="cr-mobile-estimate-actions">
          <button type="button" className="cr-mobile-share" aria-label="Передать клиенту" onClick={onShare}><Share2Icon /></button>
          {preview ? (
            <>
              <button type="button" className="cr-mobile-secondary" onClick={onEdit}><PencilIcon /> Изменить</button>
              <button type="button" className="cr-mobile-primary" onClick={onApprove}><ClipboardCheckIcon /> Утвердить</button>
            </>
          ) : (
            <button type="button" className="cr-mobile-primary" onClick={onSave}><CheckIcon /> Сохранить версию</button>
          )}
        </div>
      </section>

      {activeLine ? (
        <div className="cr-row-editor" role="dialog" aria-modal="true" aria-label="Редактирование позиции">
          <button type="button" className="cr-row-scrim" aria-label="Закрыть позицию" onClick={onCloseLine} />
          <section>
            <header><div><strong>Позиция сметы</strong><span>{activeLine.name}</span></div><button type="button" className="cr-icon-button" aria-label="Закрыть позицию" onClick={onCloseLine}><XIcon /></button></header>
            <div className="cr-row-form">
              <label><span>Наименование</span><textarea value={activeLine.name} onChange={(event) => onUpdateLine(activeLine.id, { name: event.target.value })} /></label>
              <div className="cr-row-grid">
                <label><span>Единица</span><input value={activeLine.unit} onChange={(event) => onUpdateLine(activeLine.id, { unit: event.target.value })} /></label>
                <label><span>Количество</span><input inputMode="decimal" value={activeLine.quantity} onChange={(event) => onUpdateLine(activeLine.id, { quantity: Number(event.target.value) || 0 })} /></label>
                <label><span>Цена</span><input inputMode="decimal" value={activeLine.unitPrice} onChange={(event) => onUpdateLine(activeLine.id, { unitPrice: Number(event.target.value) || 0 })} /></label>
              </div>
              <div className="cr-row-amount"><span>Сумма позиции</span><strong>{formatMoney(activeLine.quantity * activeLine.unitPrice)}</strong></div>
            </div>
            <footer><button type="button" className="cr-danger-button" onClick={() => onDeleteLine(activeLine.id)}><Trash2Icon /> Удалить</button><button type="button" className="cr-primary-button" onClick={onCloseLine}><CheckIcon /> Готово</button></footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="cr-status-row"><span><i />{label}</span><strong>{value}</strong></div>;
}
