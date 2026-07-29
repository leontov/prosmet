"use client";

import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  GripVerticalIcon,
  HistoryIcon,
  InfoIcon,
  LoaderCircleIcon,
  MailIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Redo2Icon,
  Share2Icon,
  Trash2Icon,
  Undo2Icon,
  XIcon
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import {
  EstimateDraftSchema,
  calculateEstimate,
  cloneEstimate,
  makeId,
  validateForApproval,
  type EstimateDraft,
  type EstimateItem,
  type EstimateSection,
  type PriceSource,
  type ResourceType
} from "@/lib/domain/estimate";
import { exportEstimatePdf, exportEstimateXlsx } from "@/lib/exports/estimate";
import { useLocalWorkspace } from "@/lib/local/context";
import {
  candidatePriceSource,
  currentPriceContextHash,
  listPriceHistory,
  recordEstimatePriceStatus,
  recordPriceEdit,
  recordSuggestedEstimatePrices,
  resolveLocalPrice,
  type LocalPriceResolution
} from "@/lib/local/price-intelligence";
import { getRepository } from "@/lib/local/repository";
import {
  canUseNativeEstimateShare,
  copyEstimateSummary,
  downloadEstimateForSharing,
  openEstimateEmail,
  openEstimateWhatsApp,
  shareEstimateNative,
  type EstimateShareChannel
} from "@/lib/sharing/estimate";
import { cn, formatMoney } from "@/lib/utils";

const statusLabels: Record<EstimateDraft["status"], string> = {
  draft: "Черновик",
  review: "Сохранена",
  approved: "Утверждена",
  sent: "Передана клиенту"
};

const sourceLabels: Record<PriceSource["kind"], string> = {
  personal: "Личная",
  organization: "Организация",
  "previous-estimate": "Предыдущая смета",
  supplier: "Поставщик",
  regional: "Рынок региона",
  official: "Официальная",
  external: "Исследование",
  indicative: "Ориентировочная",
  unknown: "Источник не указан"
};

const resourceLabels: Record<ResourceType, string> = {
  work: "Работа",
  material: "Материал",
  machine: "Машина",
  equipment: "Оборудование",
  labor: "Труд",
  service: "Услуга",
  logistics: "Логистика"
};

type ToolStatus = { type?: string };
type ExperienceMode = "card" | "edit" | "preview";
type SaveState = "saved" | "saving" | "offline" | "error";
type ActiveRow = { sectionId: string; itemId: string } | null;

type UndoNotice = {
  label: string;
  restore: () => void;
};

function parseDraft(args: unknown) {
  const parsed = EstimateDraftSchema.safeParse(args);
  return parsed.success ? parsed.data : null;
}

function itemCount(draft: EstimateDraft) {
  return draft.sections.reduce((total, section) => total + section.items.length, 0);
}

function findItem(draft: EstimateDraft, row: ActiveRow) {
  if (!row) return null;
  const section = draft.sections.find((entry) => entry.id === row.sectionId);
  const item = section?.items.find((entry) => entry.id === row.itemId);
  return section && item ? { section, item } : null;
}

function blankItem(): EstimateItem {
  return {
    id: makeId("item"),
    code: "",
    name: "Новая позиция",
    unit: "шт",
    quantity: 1,
    norm: 1,
    coefficient: 1,
    unitPrice: 0,
    resourceType: "work",
    source: {
      label: "Источник не указан",
      kind: "unknown",
      region: "",
      date: "",
      currency: "RUB",
      vatIncluded: false,
      deliveryIncluded: false,
      confidence: 0,
      confirmed: false,
      status: "suggested"
    },
    comment: "",
    warning: "",
    priceContext: {
      materialsIncluded: false,
      deliveryIncluded: false,
      equipmentIncluded: false,
      vatIncluded: false,
      constrainedConditions: false,
      qualityLevel: "standard",
      urgency: "normal",
      season: ""
    }
  };
}

function blankSection(): EstimateSection {
  return { id: makeId("section"), title: "Новый раздел", items: [blankItem()] };
}

export function EstimateDocumentExperience({
  args,
  status
}: {
  args: unknown;
  status?: ToolStatus;
}) {
  const incoming = useMemo(() => parseDraft(args), [args]);
  const workspace = useLocalWorkspace();
  const [draft, setDraft] = useState<EstimateDraft | null>(incoming);
  const [mode, setMode] = useState<ExperienceMode>("card");
  const [saveState, setSaveState] = useState<SaveState>("saving");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<ActiveRow>(null);
  const [priceRow, setPriceRow] = useState<ActiveRow>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState<"done" | "pdf" | "xlsx" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<EstimateDraft[]>([]);
  const [redoStack, setRedoStack] = useState<EstimateDraft[]>([]);
  const [undoNotice, setUndoNotice] = useState<UndoNotice | null>(null);
  const initialized = useRef<string | null>(null);
  const dirty = useRef(false);
  const priceBefore = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!incoming || initialized.current === incoming.id) return;
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const stored = await repository.getEstimate(incoming.id);
      const next = stored ?? incoming;
      if (!stored) await repository.saveEstimate(workspace.currentThreadId, incoming);
      await recordSuggestedEstimatePrices(next);
      if (cancelled) return;
      initialized.current = incoming.id;
      setDraft(next);
      setSaveState("saved");
    })().catch((reason) => {
      if (cancelled) return;
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : "Не удалось открыть смету");
    });
    return () => {
      cancelled = true;
    };
  }, [incoming, workspace.currentThreadId]);

  useEffect(() => {
    if (!draft || !dirty.current) return;
    setSaveState(navigator.onLine ? "saving" : "offline");
    const timer = window.setTimeout(() => {
      void getRepository()
        .then((repository) => repository.saveEstimate(workspace.currentThreadId, draft))
        .then(() => {
          dirty.current = false;
          setSaveState(navigator.onLine ? "saved" : "offline");
          window.dispatchEvent(new Event("prosmet:local-data-changed"));
        })
        .catch((reason) => {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : "Автосохранение не выполнено");
        });
    }, 480);
    return () => window.clearTimeout(timer);
  }, [draft, workspace.currentThreadId]);

  useEffect(() => {
    if (!undoNotice) return;
    const timer = window.setTimeout(() => setUndoNotice(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [undoNotice]);

  const calculation = useMemo(() => (draft ? calculateEstimate(draft) : null), [draft]);
  const running = status?.type === "running" || !draft;

  const replaceDraft = useCallback(
    (next: EstimateDraft, options: { remember?: boolean } = { remember: true }) => {
      if (!draft) return;
      if (options.remember !== false) {
        setUndoStack((current) => [...current.slice(-39), cloneEstimate(draft)]);
        setRedoStack([]);
      }
      dirty.current = true;
      setSaveState(navigator.onLine ? "saving" : "offline");
      setError(null);
      setDraft({
        ...next,
        status: next.status === "sent" || next.status === "approved" ? "draft" : next.status,
        updatedAt: new Date().toISOString()
      });
    },
    [draft]
  );

  const change = useCallback(
    (updater: (current: EstimateDraft) => EstimateDraft, remember = true) => {
      if (!draft) return;
      replaceDraft(updater(cloneEstimate(draft)), { remember });
    },
    [draft, replaceDraft]
  );

  const undo = () => {
    if (!draft || !undoStack.length) return;
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-39), cloneEstimate(draft)]);
    replaceDraft(previous, { remember: false });
  };

  const redo = () => {
    if (!draft || !redoStack.length) return;
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-39), cloneEstimate(draft)]);
    replaceDraft(next, { remember: false });
  };

  const updateItem = <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K],
    remember = true
  ) =>
    change(
      (current) => ({
        ...current,
        sections: current.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                items: section.items.map((item) =>
                  item.id === itemId ? { ...item, [key]: value } : item
                )
              }
            : section
        )
      }),
      remember
    );

  const deleteItem = (sectionId: string, itemId: string) => {
    if (!draft) return;
    const before = cloneEstimate(draft);
    change((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === sectionId
          ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
          : section
      )
    }));
    setActiveRow(null);
    setUndoNotice({
      label: "Позиция удалена",
      restore: () => {
        replaceDraft(before);
        setUndoNotice(null);
      }
    });
  };

  const deleteSection = (sectionId: string) => {
    if (!draft) return;
    const before = cloneEstimate(draft);
    change((current) => ({
      ...current,
      sections: current.sections.filter((section) => section.id !== sectionId)
    }));
    setUndoNotice({
      label: "Раздел удалён",
      restore: () => {
        replaceDraft(before);
        setUndoNotice(null);
      }
    });
  };

  const finishEditing = async () => {
    if (!draft) return;
    setBusy("done");
    setError(null);
    try {
      const next: EstimateDraft = {
        ...cloneEstimate(draft),
        status: "review",
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString()
      };
      const repository = await getRepository();
      await repository.saveEstimate(workspace.currentThreadId, next, true);
      setDraft(next);
      dirty.current = false;
      setSaveState("saved");
      setMode("preview");
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить версию");
    } finally {
      setBusy(null);
    }
  };

  const deleteEstimate = async () => {
    if (!draft) return;
    const before = cloneEstimate(draft);
    setMenuOpen(false);
    try {
      await (await getRepository()).deleteEstimate(draft.id);
      setDraft({ ...draft, deletedAt: new Date().toISOString() });
      setUndoNotice({
        label: "Смета удалена",
        restore: () => {
          void getRepository()
            .then((repository) => repository.restoreEstimate(before, workspace.currentThreadId))
            .then(() => {
              setDraft(before);
              setMode("card");
              setUndoNotice(null);
            });
        }
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить смету");
    }
  };

  const duplicateEstimate = async () => {
    if (!draft) return;
    const duplicate: EstimateDraft = {
      ...cloneEstimate(draft),
      id: makeId("estimate"),
      title: `${draft.title} — копия`,
      revision: 1,
      status: "draft",
      updatedAt: new Date().toISOString(),
      deletedAt: null
    };
    await (await getRepository()).saveEstimate(workspace.currentThreadId, duplicate);
    setDraft(duplicate);
    initialized.current = duplicate.id;
    setMode("edit");
    setMenuOpen(false);
  };

  const renameEstimate = () => {
    if (!draft) return;
    const title = window.prompt("Название сметы", draft.title)?.trim();
    if (!title || title === draft.title) return;
    change((current) => ({ ...current, title }));
    setMenuOpen(false);
  };

  const beginPriceEdit = (item: EstimateItem) => {
    priceBefore.current[item.id] = item.unitPrice;
  };

  const finishPriceEdit = async (item: EstimateItem) => {
    if (!draft) return;
    const previous = priceBefore.current[item.id];
    delete priceBefore.current[item.id];
    if (previous === undefined || previous === item.unitPrice) return;
    await recordPriceEdit({
      draft,
      item,
      previousPrice: previous,
      acceptedPrice: item.unitPrice
    }).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "История цены не сохранена")
    );
  };

  const deliver = async (channel: EstimateShareChannel) => {
    if (!draft) return;
    setBusy("share");
    setError(null);
    try {
      const validation = validateForApproval(draft);
      if (!validation.canApprove) {
        throw new Error(
          `Перед отправкой устраните замечания:\n${validation.blockers
            .slice(0, 6)
            .map((item) => `• ${item}`)
            .join("\n")}`
        );
      }
      const sent: EstimateDraft = {
        ...cloneEstimate(draft),
        status: "sent",
        revision: draft.revision + 1,
        updatedAt: new Date().toISOString()
      };
      const repository = await getRepository();
      await repository.saveEstimate(workspace.currentThreadId, sent, true);
      await repository.saveConfirmedPrices(sent);
      await recordEstimatePriceStatus(sent, "sent_to_client");

      if (channel === "native") {
        const result = await shareEstimateNative(sent);
        if (result.status === "cancelled") return;
        if (result.status === "unsupported") await downloadEstimateForSharing(sent);
      } else if (channel === "whatsapp") {
        openEstimateWhatsApp(sent);
      } else if (channel === "email") {
        openEstimateEmail(sent);
      } else if (channel === "clipboard") {
        await copyEstimateSummary(sent);
      } else {
        await downloadEstimateForSharing(sent);
      }

      setDraft(sent);
      setShareOpen(false);
      setSaveState("saved");
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось передать смету");
    } finally {
      setBusy(null);
    }
  };

  if (running) return <EstimateLoadingCard />;
  if (!draft || draft.deletedAt) {
    return (
      <div className="my-3 w-full max-w-[var(--thread-max-width)] rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-500">
        Смета удалена. Подтверждённые личные цены сохранены в каталоге.
      </div>
    );
  }

  return (
    <div className="relative my-3 w-full max-w-[var(--thread-max-width)]" data-testid="estimate-document-experience">
      {mode === "card" ? (
        <EstimateArtifactCard
          draft={draft}
          total={calculation?.total ?? 0}
          menuOpen={menuOpen}
          onOpen={() => setMode("edit")}
          onToggleMenu={() => setMenuOpen((value) => !value)}
          onRename={renameEstimate}
          onDuplicate={() => void duplicateEstimate()}
          onPreview={() => {
            setMenuOpen(false);
            setMode("preview");
          }}
          onDelete={() => void deleteEstimate()}
        />
      ) : null}

      {mode === "preview" ? (
        <EstimateRevisionPreview
          draft={draft}
          onEdit={() => setMode("edit")}
          onDownload={() => {
            setBusy("pdf");
            void exportEstimatePdf(draft)
              .catch((reason) =>
                setError(reason instanceof Error ? reason.message : "PDF не сформирован")
              )
              .finally(() => setBusy(null));
          }}
          onShare={() => setShareOpen(true)}
          onClose={() => setMode("card")}
          onDelete={() => void deleteEstimate()}
          busy={busy}
        />
      ) : null}

      {mode === "edit" ? (
        <EstimateDocumentOverlay
          draft={draft}
          calculation={calculation!}
          saveState={saveState}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          busy={busy}
          onClose={() => setMode("card")}
          onDone={() => void finishEditing()}
          onUndo={undo}
          onRedo={redo}
          onChange={change}
          onUpdateItem={updateItem}
          onDeleteItem={deleteItem}
          onDeleteSection={deleteSection}
          onOpenRow={setActiveRow}
          onOpenPrice={setPriceRow}
          onPriceFocus={beginPriceEdit}
          onPriceBlur={(item) => void finishPriceEdit(item)}
        />
      ) : null}

      {activeRow && draft ? (
        <EstimateRowDetailsSheet
          draft={draft}
          row={activeRow}
          onClose={() => setActiveRow(null)}
          onChange={updateItem}
          onDelete={deleteItem}
          onOpenPrice={() => {
            setPriceRow(activeRow);
            setActiveRow(null);
          }}
        />
      ) : null}

      {priceRow && draft ? (
        <PriceInspector
          draft={draft}
          row={priceRow}
          onClose={() => setPriceRow(null)}
          onApply={(price, source) => {
            const target = findItem(draft, priceRow);
            if (!target) return;
            priceBefore.current[target.item.id] = target.item.unitPrice;
            updateItem(priceRow.sectionId, priceRow.itemId, "unitPrice", price);
            updateItem(priceRow.sectionId, priceRow.itemId, "source", source, false);
            window.setTimeout(() => {
              const current = findItem(
                {
                  ...draft,
                  sections: draft.sections.map((section) =>
                    section.id === priceRow.sectionId
                      ? {
                          ...section,
                          items: section.items.map((item) =>
                            item.id === priceRow.itemId ? { ...item, unitPrice: price, source } : item
                          )
                        }
                      : section
                  )
                },
                priceRow
              );
              if (current) void finishPriceEdit(current.item);
            }, 0);
            setPriceRow(null);
          }}
        />
      ) : null}

      {shareOpen ? (
        <EstimateShareSheet
          draft={draft}
          busy={busy === "share"}
          onClose={() => setShareOpen(false)}
          onDeliver={(channel) => void deliver(channel)}
        />
      ) : null}

      {undoNotice ? (
        <div className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-[160] flex -translate-x-1/2 items-center gap-4 rounded-xl bg-neutral-950 px-4 py-3 text-sm text-white shadow-2xl">
          <span>{undoNotice.label}</span>
          <button
            type="button"
            onClick={undoNotice.restore}
            className="font-semibold text-indigo-200 hover:text-white"
          >
            Отменить
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function EstimateArtifactCard({
  draft,
  total,
  menuOpen,
  onOpen,
  onToggleMenu,
  onRename,
  onDuplicate,
  onPreview,
  onDelete
}: {
  draft: EstimateDraft;
  total: number;
  menuOpen: boolean;
  onOpen: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onPreview: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="group relative overflow-visible rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 hover:shadow-md" data-testid="estimate-artifact-card">
      <button type="button" onClick={onOpen} className="block w-full p-4 text-left sm:p-5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <FileTextIcon className="size-4" />
          <span>Локальная смета</span>
          <span>·</span>
          <span>{statusLabels[draft.status]}</span>
          <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5">v{draft.revision}</span>
        </div>
        <h3 className="mt-3 pr-10 text-base font-semibold tracking-[-0.02em] text-neutral-950 sm:text-lg">
          {draft.title}
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          {draft.objectName || "Объект не указан"}
          {draft.region ? ` · ${draft.region}` : ""} · {itemCount(draft)} позиций
        </p>
        <div className="mt-5 flex items-end justify-between gap-4">
          <span className="inline-flex h-10 items-center rounded-xl bg-neutral-900 px-4 text-sm font-medium text-white">
            Открыть смету
          </span>
          <span className="text-right text-xl font-semibold tracking-[-0.035em] text-neutral-950 sm:text-2xl">
            {formatMoney(total, draft.currency)}
          </span>
        </div>
      </button>
      <div className="absolute right-3 top-12 z-20">
        <button
          type="button"
          aria-label="Действия со сметой"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
          className="flex size-9 items-center justify-center rounded-lg bg-white/90 text-neutral-500 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-11 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1.5 text-sm shadow-xl">
            <MenuButton onClick={onRename}>Переименовать</MenuButton>
            <MenuButton onClick={onDuplicate}><CopyIcon /> Дублировать</MenuButton>
            <MenuButton onClick={onPreview}><HistoryIcon /> Показать версию</MenuButton>
            <MenuButton danger onClick={onDelete}><Trash2Icon /> Удалить смету</MenuButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EstimateDocumentOverlay({
  draft,
  calculation,
  saveState,
  canUndo,
  canRedo,
  busy,
  onClose,
  onDone,
  onUndo,
  onRedo,
  onChange,
  onUpdateItem,
  onDeleteItem,
  onDeleteSection,
  onOpenRow,
  onOpenPrice,
  onPriceFocus,
  onPriceBlur
}: {
  draft: EstimateDraft;
  calculation: ReturnType<typeof calculateEstimate>;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  busy: string | null;
  onClose: () => void;
  onDone: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (updater: (current: EstimateDraft) => EstimateDraft, remember?: boolean) => void;
  onUpdateItem: <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K],
    remember?: boolean
  ) => void;
  onDeleteItem: (sectionId: string, itemId: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onOpenRow: (row: ActiveRow) => void;
  onOpenPrice: (row: ActiveRow) => void;
  onPriceFocus: (item: EstimateItem) => void;
  onPriceBlur: (item: EstimateItem) => void;
}) {
  const [dragged, setDragged] = useState<ActiveRow>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const reorder = (target: ActiveRow) => {
    if (!dragged || !target || dragged.sectionId !== target.sectionId || dragged.itemId === target.itemId) {
      setDragged(null);
      return;
    }
    onChange((current) => ({
      ...current,
      sections: current.sections.map((section) => {
        if (section.id !== target.sectionId) return section;
        const items = [...section.items];
        const from = items.findIndex((item) => item.id === dragged.itemId);
        const to = items.findIndex((item) => item.id === target.itemId);
        if (from < 0 || to < 0) return section;
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
        return { ...section, items };
      })
    }));
    setDragged(null);
  };

  return (
    <div className="fixed inset-0 z-[120] flex h-dvh flex-col bg-[#eceef2]" data-testid="estimate-document-overlay">
      <header className="no-print flex min-h-16 items-center gap-2 border-b border-neutral-200 bg-white px-3 sm:px-5">
        <button type="button" onClick={onClose} className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium hover:bg-neutral-100">
          <ArrowLeftIcon className="size-4" /> <span className="hidden sm:inline">Назад</span>
        </button>
        <SaveIndicator state={saveState} />
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label="Отменить" disabled={!canUndo} onClick={onUndo}><Undo2Icon /></IconButton>
          <IconButton label="Повторить" disabled={!canRedo} onClick={onRedo}><Redo2Icon /></IconButton>
          <button
            type="button"
            onClick={onDone}
            disabled={busy !== null}
            className="ml-1 inline-flex h-10 items-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-50"
          >
            {busy === "done" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
            Готово
          </button>
        </div>
      </header>

      <main className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6 sm:py-8">
        <EstimateDocumentCanvas
          draft={draft}
          calculation={calculation}
          editable
          onChange={onChange}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
          onDeleteSection={onDeleteSection}
          onOpenRow={onOpenRow}
          onOpenPrice={onOpenPrice}
          onPriceFocus={onPriceFocus}
          onPriceBlur={onPriceBlur}
          dragged={dragged}
          onDragStart={setDragged}
          onDrop={reorder}
        />
      </main>
    </div>
  );
}

function EstimateDocumentCanvas({
  draft,
  calculation,
  editable = false,
  onChange,
  onUpdateItem,
  onDeleteItem,
  onDeleteSection,
  onOpenRow,
  onOpenPrice,
  onPriceFocus,
  onPriceBlur,
  dragged,
  onDragStart,
  onDrop
}: {
  draft: EstimateDraft;
  calculation: ReturnType<typeof calculateEstimate>;
  editable?: boolean;
  onChange?: (updater: (current: EstimateDraft) => EstimateDraft, remember?: boolean) => void;
  onUpdateItem?: <K extends keyof EstimateItem>(
    sectionId: string,
    itemId: string,
    key: K,
    value: EstimateItem[K],
    remember?: boolean
  ) => void;
  onDeleteItem?: (sectionId: string, itemId: string) => void;
  onDeleteSection?: (sectionId: string) => void;
  onOpenRow?: (row: ActiveRow) => void;
  onOpenPrice?: (row: ActiveRow) => void;
  onPriceFocus?: (item: EstimateItem) => void;
  onPriceBlur?: (item: EstimateItem) => void;
  dragged?: ActiveRow;
  onDragStart?: (row: ActiveRow) => void;
  onDrop?: (row: ActiveRow) => void;
}) {
  let position = 0;
  return (
    <article className="print-page mx-auto min-h-[1120px] w-full max-w-[900px] bg-white px-4 py-8 text-neutral-950 shadow-[0_18px_60px_rgba(15,23,42,0.14)] sm:px-10 sm:py-12" data-testid="estimate-document-canvas">
      <div className="mx-auto max-w-[760px]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Локальная смета
        </p>
        {editable ? (
          <DocumentTextInput
            value={draft.title}
            onChange={(value) => onChange?.((current) => ({ ...current, title: value }))}
            ariaLabel="Название сметы"
            className="mt-3 w-full text-center text-2xl font-semibold tracking-[-0.035em] sm:text-3xl"
          />
        ) : (
          <h2 className="mt-3 text-center text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{draft.title}</h2>
        )}

        <div className="mt-8 grid gap-x-8 gap-y-2 border-y border-neutral-200 py-4 text-sm sm:grid-cols-2">
          <DocumentMeta label="Объект" value={draft.objectName} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, objectName: value }))} />
          <DocumentMeta label="Дата" value={draft.date} editable={editable} type="date" onChange={(value) => onChange?.((current) => ({ ...current, date: value }))} />
          <DocumentMeta label="Заказчик" value={draft.customer} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, customer: value }))} />
          <DocumentMeta label="Регион" value={draft.region} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, region: value }))} />
        </div>

        <div className="mt-8 hidden grid-cols-[40px_minmax(240px,1fr)_64px_92px_110px_118px_32px] border-y border-neutral-900 bg-neutral-50 text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-600 sm:grid">
          <span className="px-2 py-3 text-center">№</span>
          <span className="px-2 py-3">Наименование</span>
          <span className="px-2 py-3 text-center">Ед.</span>
          <span className="px-2 py-3 text-right">Кол.</span>
          <span className="px-2 py-3 text-right">Цена</span>
          <span className="px-2 py-3 text-right">Сумма</span>
          <span />
        </div>

        <div className="border-b border-neutral-900">
          {draft.sections.map((section) => (
            <section key={section.id} className="group/section">
              <div className="flex items-center gap-2 border-b border-neutral-300 bg-neutral-100 px-2 py-2.5">
                {editable ? (
                  <DocumentTextInput
                    value={section.title}
                    ariaLabel={`Название раздела ${section.title}`}
                    onChange={(value) =>
                      onChange?.((current) => ({
                        ...current,
                        sections: current.sections.map((entry) =>
                          entry.id === section.id ? { ...entry, title: value } : entry
                        )
                      }))
                    }
                    className="min-w-0 flex-1 text-sm font-semibold uppercase tracking-[0.04em]"
                  />
                ) : (
                  <h3 className="min-w-0 flex-1 text-sm font-semibold uppercase tracking-[0.04em]">{section.title}</h3>
                )}
                {editable ? (
                  <button type="button" aria-label="Удалить раздел" onClick={() => onDeleteSection?.(section.id)} className="flex size-8 items-center justify-center rounded-lg text-neutral-400 opacity-100 hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover/section:opacity-100">
                    <Trash2Icon className="size-4" />
                  </button>
                ) : null}
              </div>

              {section.items.map((item) => {
                position += 1;
                const row: ActiveRow = { sectionId: section.id, itemId: item.id };
                return (
                  <EstimateLineRow
                    key={item.id}
                    position={position}
                    item={item}
                    amount={calculation.itemAmounts[item.id] ?? 0}
                    currency={draft.currency}
                    editable={editable}
                    isDragged={dragged?.itemId === item.id}
                    onUpdate={(key, value, remember) => onUpdateItem?.(section.id, item.id, key, value, remember)}
                    onDelete={() => onDeleteItem?.(section.id, item.id)}
                    onOpen={() => onOpenRow?.(row)}
                    onOpenPrice={() => onOpenPrice?.(row)}
                    onPriceFocus={() => onPriceFocus?.(item)}
                    onPriceBlur={(nextPrice) => onPriceBlur?.({ ...item, unitPrice: nextPrice })}
                    onDragStart={() => onDragStart?.(row)}
                    onDrop={() => onDrop?.(row)}
                  />
                );
              })}

              {editable ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange?.((current) => ({
                      ...current,
                      sections: current.sections.map((entry) =>
                        entry.id === section.id
                          ? { ...entry, items: [...entry.items, blankItem()] }
                          : entry
                      )
                    }))
                  }
                  className="flex min-h-11 w-full items-center gap-2 border-t border-dashed border-neutral-200 px-3 text-sm text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                >
                  <PlusIcon className="size-4" /> Добавить позицию
                </button>
              ) : null}
            </section>
          ))}
        </div>

        {editable ? (
          <button
            type="button"
            onClick={() => onChange?.((current) => ({ ...current, sections: [...current.sections, blankSection()] }))}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 text-sm font-medium text-neutral-500 hover:border-neutral-500 hover:text-neutral-900"
          >
            <PlusIcon className="size-4" /> Добавить раздел
          </button>
        ) : null}

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-sm border-t-2 border-neutral-950 pt-4">
            <div className="flex items-end justify-between gap-5">
              <span className="text-sm font-semibold uppercase tracking-[0.08em]">Итого</span>
              <strong className="text-2xl tracking-[-0.035em]">{formatMoney(calculation.total, draft.currency)}</strong>
            </div>
          </div>
        </div>

        <details className="mt-8 border-t border-neutral-200 py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
            <span>Расчёт итога</span><ChevronDownIcon className="size-4" />
          </summary>
          <div className="mt-2 grid gap-2 text-sm text-neutral-600 sm:ml-auto sm:max-w-sm">
            <TotalLine label="Прямые затраты" value={formatMoney(calculation.directCost, draft.currency)} />
            <EditablePercentLine label="Накладные" value={draft.overheadPercent} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, overheadPercent: value }))} amount={formatMoney(calculation.overhead, draft.currency)} />
            <EditablePercentLine label="Прибыль" value={draft.profitPercent} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, profitPercent: value }))} amount={formatMoney(calculation.profit, draft.currency)} />
            <EditablePercentLine label="Скидка" value={draft.discountPercent} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, discountPercent: value }))} amount={`− ${formatMoney(calculation.discount, draft.currency)}`} />
            <EditablePercentLine label="НДС" value={draft.vatPercent} editable={editable} onChange={(value) => onChange?.((current) => ({ ...current, vatPercent: value }))} amount={formatMoney(calculation.vat, draft.currency)} />
          </div>
        </details>

        <details className="border-t border-neutral-200 py-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">
            <span>Основание расчёта · {draft.technology.length} технологических операций</span><ChevronDownIcon className="size-4" />
          </summary>
          <div className="mt-3 space-y-4 text-sm leading-6 text-neutral-600">
            {draft.technology.length ? (
              <ol className="space-y-2">
                {draft.technology.map((step, index) => (
                  <li key={step.id} className="flex gap-3"><span className="font-semibold text-neutral-400">{index + 1}.</span><span>{step.title}</span></li>
                ))}
              </ol>
            ) : <p>Технологическая карта пока не заполнена.</p>}
            {draft.assumptions.length ? <div><h4 className="font-semibold text-neutral-900">Допущения</h4><ul className="mt-1 list-disc pl-5">{draft.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            {draft.warnings.length ? <div><h4 className="font-semibold text-neutral-900">Замечания</h4><ul className="mt-1 list-disc pl-5">{draft.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
          </div>
        </details>
      </div>
    </article>
  );
}

function EstimateLineRow({
  position,
  item,
  amount,
  currency,
  editable,
  isDragged,
  onUpdate,
  onDelete,
  onOpen,
  onOpenPrice,
  onPriceFocus,
  onPriceBlur,
  onDragStart,
  onDrop
}: {
  position: number;
  item: EstimateItem;
  amount: number;
  currency: string;
  editable: boolean;
  isDragged: boolean;
  onUpdate: <K extends keyof EstimateItem>(key: K, value: EstimateItem[K], remember?: boolean) => void;
  onDelete: () => void;
  onOpen: () => void;
  onOpenPrice: () => void;
  onPriceFocus: () => void;
  onPriceBlur: (price: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      className={cn("group/row border-b border-neutral-200 last:border-b-0", isDragged && "opacity-40")}
      draggable={editable}
      onDragStart={onDragStart}
      onDragOver={(event) => editable && event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="hidden min-h-12 grid-cols-[40px_minmax(240px,1fr)_64px_92px_110px_118px_32px] items-center sm:grid">
        <span className="relative px-2 text-center text-sm text-neutral-500">
          {editable ? <GripVerticalIcon className="absolute -left-4 top-1/2 size-4 -translate-y-1/2 text-neutral-300 opacity-0 group-hover/row:opacity-100" /> : null}
          {position}
        </span>
        {editable ? <DocumentTextInput value={item.name} ariaLabel={`Наименование позиции ${position}`} onChange={(value) => onUpdate("name", value)} className="px-2 py-2 text-sm font-medium" /> : <span className="px-2 py-3 text-sm font-medium">{item.name}</span>}
        {editable ? <DocumentTextInput value={item.unit} ariaLabel={`Единица позиции ${position}`} onChange={(value) => onUpdate("unit", value)} className="px-2 py-2 text-center text-sm" /> : <span className="px-2 text-center text-sm">{item.unit}</span>}
        {editable ? <DocumentNumberInput value={item.quantity} ariaLabel={`Количество позиции ${position}`} onChange={(value) => onUpdate("quantity", value)} className="px-2 py-2 text-right text-sm" /> : <span className="px-2 text-right text-sm tabular-nums">{item.quantity}</span>}
        {editable ? (
          <div className="group/price relative flex min-h-11 flex-col items-end justify-center px-2 text-right hover:bg-indigo-50">
            <DocumentNumberInput value={item.unitPrice} ariaLabel={`Цена позиции ${position}`} onChange={(value) => onUpdate("unitPrice", value, false)} onFocus={onPriceFocus} onBlur={onPriceBlur} className="w-full text-right text-sm font-medium" stopPropagation />
            <button type="button" onClick={onOpenPrice} aria-label={`Показать аналитику цены позиции ${position}`} className="text-[10px] text-indigo-600 opacity-0 transition-opacity group-hover/price:opacity-100 focus:opacity-100">
              {sourceLabels[item.source.kind]}
            </button>
          </div>
        ) : <span className="px-2 text-right text-sm tabular-nums">{formatMoney(item.unitPrice, currency)}</span>}
        <span className="px-2 text-right text-sm font-semibold tabular-nums">{formatMoney(amount, currency)}</span>
        {editable ? <button type="button" aria-label={`Удалить позицию ${position}`} onClick={onDelete} className="flex size-8 items-center justify-center rounded-lg text-neutral-300 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover/row:opacity-100"><Trash2Icon className="size-4" /></button> : <span />}
      </div>

      <button type="button" onClick={onOpen} className="flex min-h-[72px] w-full items-center gap-3 px-1 py-3 text-left sm:hidden">
        <span className="w-7 shrink-0 text-center text-xs text-neutral-400">{position}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="mt-1 block text-xs text-neutral-500">{item.quantity} {item.unit} × {formatMoney(item.unitPrice, currency)} · {sourceLabels[item.source.kind]}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(amount, currency)}</span>
      </button>
    </div>
  );
}

function EstimateRowDetailsSheet({
  draft,
  row,
  onClose,
  onChange,
  onDelete,
  onOpenPrice
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onChange: <K extends keyof EstimateItem>(sectionId: string, itemId: string, key: K, value: EstimateItem[K], remember?: boolean) => void;
  onDelete: (sectionId: string, itemId: string) => void;
  onOpenPrice: () => void;
}) {
  const target = findItem(draft, row);
  if (!target) return null;
  const item = target.item;
  return (
    <ModalShell onClose={onClose} align="bottom" label="Редактирование позиции">
      <div className="mx-auto w-full max-w-xl rounded-t-3xl bg-white p-4 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Позиция сметы</h3>
          <IconButton label="Закрыть" onClick={onClose}><XIcon /></IconButton>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Наименование" wide><input className="prosmet-input" value={item.name} onChange={(event) => onChange(row.sectionId, row.itemId, "name", event.target.value)} /></Field>
          <Field label="Количество"><input className="prosmet-input" type="number" min="0" step="any" value={item.quantity} onChange={(event) => onChange(row.sectionId, row.itemId, "quantity", Math.max(0, Number(event.target.value) || 0))} /></Field>
          <Field label="Единица"><input className="prosmet-input" value={item.unit} onChange={(event) => onChange(row.sectionId, row.itemId, "unit", event.target.value)} /></Field>
          <Field label="Цена"><button type="button" onClick={onOpenPrice} className="prosmet-input flex items-center justify-between text-left"><span>{item.unitPrice}</span><span className="text-xs text-indigo-600">Открыть аналитику</span></button></Field>
          <Field label="Код нормы"><input className="prosmet-input" value={item.code} onChange={(event) => onChange(row.sectionId, row.itemId, "code", event.target.value)} /></Field>
          <Field label="Тип ресурса"><select className="prosmet-input" value={item.resourceType} onChange={(event) => onChange(row.sectionId, row.itemId, "resourceType", event.target.value as ResourceType)}>{Object.entries(resourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Норма"><input className="prosmet-input" type="number" min="0.000001" step="any" value={item.norm} onChange={(event) => onChange(row.sectionId, row.itemId, "norm", Math.max(0.000001, Number(event.target.value) || 1))} /></Field>
          <Field label="Коэффициент"><input className="prosmet-input" type="number" min="0.000001" step="any" value={item.coefficient} onChange={(event) => onChange(row.sectionId, row.itemId, "coefficient", Math.max(0.000001, Number(event.target.value) || 1))} /></Field>
          <Field label="Комментарий" wide><textarea className="prosmet-input" value={item.comment} onChange={(event) => onChange(row.sectionId, row.itemId, "comment", event.target.value)} /></Field>
          <Field label="Предупреждение" wide><textarea className="prosmet-input" value={item.warning} onChange={(event) => onChange(row.sectionId, row.itemId, "warning", event.target.value)} /></Field>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => onDelete(row.sectionId, row.itemId)} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2Icon className="size-4" /> Удалить позицию</button>
          <button type="button" onClick={onClose} className="h-11 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white">Готово</button>
        </div>
      </div>
    </ModalShell>
  );
}

function PriceInspector({
  draft,
  row,
  onClose,
  onApply
}: {
  draft: EstimateDraft;
  row: NonNullable<ActiveRow>;
  onClose: () => void;
  onApply: (price: number, source: PriceSource) => void;
}) {
  const target = findItem(draft, row);
  const [resolution, setResolution] = useState<LocalPriceResolution | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof listPriceHistory>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      resolveLocalPrice({ item: target.item, region: draft.region, currency: draft.currency }),
      listPriceHistory(draft.id, target.item.id)
    ]).then(([nextResolution, nextHistory]) => {
      if (cancelled) return;
      setResolution(nextResolution);
      setHistory(nextHistory);
      setLoading(false);
    }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить цены");
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [draft.currency, draft.id, draft.region, target?.item.id, currentPriceContextHash(target?.item ?? blankItem())]);

  if (!target) return null;
  const item = target.item;
  return (
    <ModalShell onClose={onClose} align="right" label="Аналитика цены">
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl sm:p-6" data-testid="price-inspector">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-400">Price Intelligence</p><h3 className="mt-1 text-lg font-semibold">{item.name}</h3><p className="mt-1 text-sm text-neutral-500">{draft.region || "Регион не указан"} · {item.unit}</p></div>
          <IconButton label="Закрыть" onClick={onClose}><XIcon /></IconButton>
        </div>
        <div className="mt-6 rounded-2xl bg-neutral-950 p-4 text-white">
          <p className="text-xs text-white/60">Цена в смете</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(item.unitPrice, draft.currency)} / {item.unit}</p>
          <p className="mt-2 text-xs text-white/60">{sourceLabels[item.source.kind]} · уверенность {Math.round(item.source.confidence)}%</p>
        </div>

        {loading ? <div className="mt-6 flex items-center gap-2 text-sm text-neutral-500"><LoaderCircleIcon className="size-4 animate-spin" /> Сравниваем личные, организационные и рыночные наблюдения…</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        {resolution ? (
          <div className="mt-6 space-y-2">
            <CandidateRow label="Личная последняя" candidate={resolution.personal} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <CandidateRow label="Организация" candidate={resolution.organization} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <CandidateRow label="Предыдущая смета" candidate={resolution.previousEstimate} currency={draft.currency} unit={item.unit} onApply={onApply} />
            {resolution.market ? (
              <div className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Рынок региона</span><span className="text-sm font-semibold">{formatMoney(resolution.market.p25, draft.currency)}–{formatMoney(resolution.market.p75, draft.currency)}</span></div>
                <div className="mt-1 flex items-center justify-between text-xs text-neutral-500"><span>Медиана</span><span>{formatMoney(resolution.market.median, draft.currency)} · {resolution.market.sampleCount} наблюдений</span></div>
                <button type="button" onClick={() => onApply(resolution.market!.median, { ...item.source, kind: "regional", label: "Медиана рынка региона", region: draft.region, date: new Date().toISOString().slice(0,10), confidence: resolution.market!.confidence, confirmed: false, status: "suggested", canonicalWorkId: resolution.canonicalWorkId, contextHash: resolution.market!.contextHash, marketRange: { p25: resolution.market!.p25, median: resolution.market!.median, p75: resolution.market!.p75 }, sampleCount: resolution.market!.sampleCount, uniqueOrganizations: resolution.market!.uniqueOrganizations })} className="mt-3 h-9 w-full rounded-lg border border-neutral-200 text-xs font-semibold hover:bg-neutral-50">Применить медиану</button>
              </div>
            ) : null}
            <CandidateRow label="Официальный ориентир" candidate={resolution.official} currency={draft.currency} unit={item.unit} onApply={onApply} />
            <CandidateRow label="Внешнее исследование" candidate={resolution.external} currency={draft.currency} unit={item.unit} onApply={onApply} />
            {resolution.needsResearch ? <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><InfoIcon className="mt-0.5 size-4 shrink-0" /> Внутренних данных недостаточно. Для точной цены нужен отдельный AI-поиск рынка с сохранением источников.</div> : null}
          </div>
        ) : null}

        <div className="mt-7 border-t border-neutral-200 pt-5">
          <h4 className="text-sm font-semibold">История изменения</h4>
          {history.length ? <div className="mt-3 space-y-2">{history.slice(0, 10).map((event) => <div key={event.id} className="rounded-xl bg-neutral-50 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span>{event.status}</span><span>{new Date(event.changedAt).toLocaleString("ru-RU")}</span></div><div className="mt-1 font-medium">{formatMoney(event.previousPrice, draft.currency)} → {formatMoney(event.acceptedPrice, draft.currency)}</div></div>)}</div> : <p className="mt-2 text-sm text-neutral-500">Цена ещё не изменялась вручную.</p>}
        </div>
      </aside>
    </ModalShell>
  );
}

function CandidateRow({ label, candidate, currency, unit, onApply }: { label: string; candidate: LocalPriceResolution["selected"]; currency: string; unit: string; onApply: (price: number, source: PriceSource) => void }) {
  if (!candidate) return <div className="flex min-h-12 items-center justify-between rounded-xl border border-dashed border-neutral-200 px-3 text-sm text-neutral-400"><span>{label}</span><span>нет данных</span></div>;
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{label}</span><span className="text-sm font-semibold">{formatMoney(candidate.observation.price, currency)} / {unit}</span></div>
      <div className="mt-1 flex items-center justify-between text-xs text-neutral-500"><span>{candidate.observation.region || "регион не указан"}</span><span>оценка {Math.round(candidate.score * 100)}%</span></div>
      <button type="button" onClick={() => onApply(candidate.observation.price, candidatePriceSource(candidate))} className="mt-3 h-9 w-full rounded-lg border border-neutral-200 text-xs font-semibold hover:bg-neutral-50">Применить</button>
    </div>
  );
}

function EstimateRevisionPreview({ draft, onEdit, onDownload, onShare, onClose, onDelete, busy }: { draft: EstimateDraft; onEdit: () => void; onDownload: () => void; onShare: () => void; onClose: () => void; onDelete: () => void; busy: string | null }) {
  const calculation = calculateEstimate(draft);
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-sm" data-testid="estimate-revision-preview">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <BadgeCheckIcon className="size-4 text-emerald-600" /><span className="text-sm font-semibold">Смета · Версия {draft.revision} · Сохранена</span>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-neutral-500 hover:text-neutral-900">Свернуть в карточку</button>
      </header>
      <div className="prosmet-scrollbar max-h-[720px] overflow-y-auto p-3 sm:p-5">
        <div className="origin-top scale-[0.98] sm:scale-100"><EstimateDocumentCanvas draft={draft} calculation={calculation} /></div>
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-neutral-200 bg-white p-3">
        <button type="button" onClick={onEdit} className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white">Редактировать</button>
        <button type="button" onClick={onDownload} disabled={busy !== null} className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-medium hover:bg-neutral-50"><DownloadIcon className="size-4" /> Скачать PDF</button>
        <button type="button" onClick={onShare} className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm font-medium hover:bg-neutral-50"><Share2Icon className="size-4" /> Поделиться</button>
        <button type="button" onClick={onDelete} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2Icon className="size-4" /> Удалить</button>
      </footer>
    </section>
  );
}

function EstimateShareSheet({ draft, busy, onClose, onDeliver }: { draft: EstimateDraft; busy: boolean; onClose: () => void; onDeliver: (channel: EstimateShareChannel) => void }) {
  const native = canUseNativeEstimateShare();
  return (
    <ModalShell onClose={onClose} align="bottom" label="Передача сметы клиенту">
      <div className="mx-auto w-full max-w-lg rounded-t-3xl bg-white p-5 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">Передать клиенту</h3><p className="mt-1 text-sm text-neutral-500">{draft.title} · версия {draft.revision}</p></div><IconButton label="Закрыть" onClick={onClose}><XIcon /></IconButton></div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {native ? <ShareButton icon={<Share2Icon />} label="Системное меню" onClick={() => onDeliver("native")} disabled={busy} /> : null}
          <ShareButton icon={<MessageCircleIcon />} label="WhatsApp" onClick={() => onDeliver("whatsapp")} disabled={busy} />
          <ShareButton icon={<MailIcon />} label="Электронная почта" onClick={() => onDeliver("email")} disabled={busy} />
          <ShareButton icon={<ClipboardIcon />} label="Скопировать итог" onClick={() => onDeliver("clipboard")} disabled={busy} />
          <ShareButton icon={<DownloadIcon />} label="Скачать PDF" onClick={() => onDeliver("pdf")} disabled={busy} />
        </div>
      </div>
    </ModalShell>
  );
}

function EstimateLoadingCard() {
  return <div className="my-3 w-full max-w-[var(--thread-max-width)] rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3 text-sm text-neutral-600"><LoaderCircleIcon className="size-4 animate-spin" /> Формируем технологическую карту и документ сметы…</div><div className="mt-4 h-28 animate-pulse rounded-xl bg-neutral-100" /></div>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  const labels: Record<SaveState, string> = { saved: "Сохранено", saving: "Сохраняем…", offline: "Нет сети · сохранено локально", error: "Ошибка сохранения" };
  return <span className={cn("ml-1 inline-flex items-center gap-1.5 text-xs", state === "error" ? "text-red-600" : state === "offline" ? "text-amber-700" : "text-neutral-500")}>{state === "saving" ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : state === "saved" ? <CheckIcon className="size-3.5 text-emerald-600" /> : <DatabaseIcon className="size-3.5" />}{labels[state]}</span>;
}

function DocumentMeta({ label, value, editable, type = "text", onChange }: { label: string; value: string; editable: boolean; type?: "text" | "date"; onChange: (value: string) => void }) {
  return <div className="flex min-w-0 items-baseline gap-2"><span className="shrink-0 text-xs font-semibold uppercase tracking-[0.04em] text-neutral-400">{label}</span>{editable ? <DocumentTextInput value={value} onChange={onChange} ariaLabel={label} type={type} className="min-w-0 flex-1 text-sm" /> : <span className="min-w-0 flex-1 text-sm">{value || "—"}</span>}</div>;
}

function DocumentTextInput({ value, onChange, ariaLabel, className, type = "text" }: { value: string; onChange: (value: string) => void; ariaLabel: string; className?: string; type?: "text" | "date" }) {
  const before = useRef(value);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { onChange(before.current); event.currentTarget.blur(); }
  };
  return <input type={type} value={value} aria-label={ariaLabel} onFocus={() => { before.current = value; }} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} className={cn("rounded-md border border-transparent bg-transparent px-1 py-1 outline-none transition hover:border-neutral-200 hover:bg-neutral-50 focus:border-indigo-300 focus:bg-indigo-50/40", className)} />;
}

function DocumentNumberInput({ value, onChange, onFocus, onBlur, ariaLabel, className, stopPropagation = false }: { value: number; onChange: (value: number) => void; onFocus?: () => void; onBlur?: (value: number) => void; ariaLabel: string; className?: string; stopPropagation?: boolean }) {
  const before = useRef(value);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") { onChange(before.current); event.currentTarget.blur(); }
  };
  return <input type="number" min="0" step="any" value={value} aria-label={ariaLabel} onClick={(event) => stopPropagation && event.stopPropagation()} onFocus={(event) => { before.current = value; event.currentTarget.select(); onFocus?.(); }} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} onBlur={(event) => onBlur?.(Math.max(0, Number(event.target.value) || 0))} onKeyDown={onKeyDown} className={cn("rounded-md border border-transparent bg-transparent px-1 py-1 tabular-nums outline-none transition hover:border-neutral-200 hover:bg-neutral-50 focus:border-indigo-300 focus:bg-indigo-50/40", className)} />;
}

function EditablePercentLine({ label, value, amount, editable, onChange }: { label: string; value: number; amount: string; editable: boolean; onChange: (value: number) => void }) {
  return <div className="flex min-h-9 items-center justify-between gap-3"><span>{label}</span><span className="flex items-center gap-3">{editable ? <span className="flex items-center rounded-lg border border-neutral-200 bg-white px-2"><input type="number" min="0" step="any" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="h-8 w-14 bg-transparent text-right outline-none" /><span className="text-xs">%</span></span> : <span>{value}%</span>}<strong className="w-28 text-right font-medium text-neutral-900">{amount}</strong></span></div>;
}

function TotalLine({ label, value }: { label: string; value: string }) { return <div className="flex min-h-8 items-center justify-between gap-3"><span>{label}</span><strong className="font-medium text-neutral-900">{value}</strong></div>; }
function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={cn("grid gap-1.5 text-xs font-medium text-neutral-600", wide && "sm:col-span-2")}><span>{label}</span>{children}</label>; }
function MenuButton({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={onClick} className={cn("flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-neutral-100 [&_svg]:size-4", danger && "text-red-600 hover:bg-red-50")}>{children}</button>; }
function IconButton({ label, onClick, children, disabled = false }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex size-10 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 [&_svg]:size-4">{children}</button>; }
function ShareButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-200 px-4 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 [&_svg]:size-4">{icon}{label}</button>; }

function ModalShell({ children, onClose, align, label }: { children: ReactNode; onClose: () => void; align: "bottom" | "right"; label: string }) {
  return <div className={cn("fixed inset-0 z-[150] flex bg-black/35 backdrop-blur-[1px]", align === "bottom" ? "items-end justify-center sm:items-center" : "justify-end")} role="dialog" aria-modal="true" aria-label={label} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>{children}</div>;
}
