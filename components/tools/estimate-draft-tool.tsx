"use client";

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { useAgUiSetState } from "@assistant-ui/react-ag-ui";
import {
  ChevronDownIcon,
  CircleDashedIcon,
  FileDownIcon,
  HistoryIcon,
  SaveIcon,
  TriangleAlertIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recalculateEstimate } from "@/lib/domain/estimate-engine";
import { estimateDraftSchema } from "@/lib/domain/schemas";
import type { AgentState, EstimateDraft } from "@/lib/domain/types";
import { loadEstimateRevisions, saveEstimateRevision } from "@/lib/local/local-db";
import { SqliteEstimateMirror } from "@/lib/local/sqlite-mirror";

interface Args {
  estimate?: EstimateDraft;
}

interface Result {
  estimate?: EstimateDraft;
  status?: string;
}

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2
});
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

const fallbackState = (estimate: EstimateDraft): AgentState => ({
  project: { id: `project-${estimate.id}`, name: estimate.projectName, region: estimate.region },
  activeEstimate: estimate,
  estimateRevision: estimate.revision,
  documents: [],
  priceContext: { region: estimate.region, unconfirmedCount: 0 },
  workTrace: [],
  sync: { status: "local", cursor: null },
  provider: { id: "deterministic-chief-estimator", model: null, mode: "deterministic" },
  validation: { status: "edited-locally", warnings: estimate.warnings.length }
});

export const EstimateDraftTool: ToolCallMessagePartComponent<Args, Result> = ({
  args,
  result,
  status
}) => {
  const incoming = result?.estimate ?? args.estimate;
  const incomingKey = incoming ? `${incoming.id}:${incoming.revision}` : null;
  const [estimate, setEstimate] = useState<EstimateDraft | null>(() =>
    incoming ? estimateDraftSchema.parse(incoming) : null
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const saveInFlight = useRef(false);
  const setAgentState = useAgUiSetState<AgentState>();

  const publishAgentState = useCallback(
    (nextEstimate: EstimateDraft, validationStatus = "edited-locally") => {
      const unconfirmedCount = nextEstimate.sections
        .flatMap((section) => section.items)
        .filter((item) => !item.priceSource.confirmed).length;

      setAgentState((previous) => {
        const base = previous ?? fallbackState(nextEstimate);
        return {
          ...base,
          project: base.project ?? {
            id: `project-${nextEstimate.id}`,
            name: nextEstimate.projectName,
            region: nextEstimate.region
          },
          activeEstimate: nextEstimate,
          estimateRevision: nextEstimate.revision,
          priceContext: { region: nextEstimate.region, unconfirmedCount },
          sync: { ...base.sync, status: "local" },
          validation: {
            status: validationStatus,
            warnings: nextEstimate.warnings.length + unconfirmedCount
          }
        };
      });
    },
    [setAgentState]
  );

  useEffect(() => {
    if (!incoming) return;
    const parsed = estimateDraftSchema.parse(incoming);
    const timer = window.setTimeout(() => {
      setEstimate(parsed);
      setDirty(false);
      setSaveError(null);
      setOpenSections(Object.fromEntries(parsed.sections.map((section) => [section.id, true])));
      publishAgentState(parsed, "loaded");
      void saveEstimateRevision(parsed)
        .then(() => loadEstimateRevisions(parsed.id))
        .then((values) => setHistoryCount(values.length))
        .catch((error: unknown) => {
          setSaveError(error instanceof Error ? error.message : "Не удалось сохранить исходную revision");
        });
    }, 0);

    return () => window.clearTimeout(timer);
    // The key prevents a fresh object identity from resetting unsaved form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey]);

  const unconfirmed = useMemo(
    () =>
      estimate?.sections
        .flatMap((section) => section.items)
        .filter((item) => !item.priceSource.confirmed).length ?? 0,
    [estimate]
  );

  const persistRevision = useCallback(async () => {
    if (!estimate || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/estimate/revise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          estimate,
          baseRevision: estimate.revision,
          reason: "Редактирование пользователем в estimate_draft tool UI"
        })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        estimate?: EstimateDraft;
        error?: string;
      };
      if (!response.ok || !payload.estimate) {
        throw new Error(payload.error ?? `revision_failed_${response.status}`);
      }

      const saved = estimateDraftSchema.parse(payload.estimate);
      setEstimate(saved);
      setDirty(false);
      publishAgentState(saved, "revision-saved");
      await saveEstimateRevision(saved);

      const mirror = new SqliteEstimateMirror();
      try {
        await mirror.put(saved);
      } finally {
        mirror.close();
      }

      const revisions = await loadEstimateRevisions(saved.id);
      setHistoryCount(revisions.length);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить revision");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }, [estimate, publishAgentState]);

  useEffect(() => {
    if (!dirty || saving || !estimate) return;
    const timer = window.setTimeout(() => void persistRevision(), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, estimate, persistRevision, saving]);

  if (!estimate || status.type === "running") {
    return (
      <div className="my-3 flex items-center gap-2 rounded-xl border border-neutral-200 p-4 text-sm text-neutral-600">
        <CircleDashedIcon className="size-4 animate-spin" />
        Собираю позиции и пересчитываю итоги…
      </div>
    );
  }

  const editItem = (
    sectionId: string,
    itemId: string,
    field: "quantity" | "unitPrice" | "coefficient" | "name" | "unit",
    value: string
  ) => {
    setEstimate((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      const item = next.sections
        .find((section) => section.id === sectionId)
        ?.items.find((candidate) => candidate.id === itemId);
      if (!item) return current;

      if (field === "name" || field === "unit") item[field] = value;
      else item[field] = Number(value) || 0;

      const recalculated = recalculateEstimate(next, current.revision);
      publishAgentState(recalculated);
      return recalculated;
    });
    setDirty(true);
    setSaveError(null);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(estimate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${estimate.title.replace(/[^a-zа-я0-9]+/gi, "-").toLowerCase()}-r${estimate.revision}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="my-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,.06)]">
      <header className="border-b border-neutral-200 bg-neutral-50/75 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Редактируемая смета · Revision {estimate.revision}
            </p>
            <h3 className="mt-1 text-base font-semibold sm:text-lg">{estimate.title}</h3>
            <p className="mt-1 text-xs text-neutral-500">
              {estimate.region} · {estimate.calculationMethod} ·{" "}
              {new Date(estimate.updatedAt).toLocaleString("ru-RU")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium hover:bg-neutral-50"
            >
              <FileDownIcon className="size-3.5" /> Экспорт JSON
            </button>
            <button
              type="button"
              onClick={() => void persistRevision()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              <SaveIcon className="size-3.5" />
              {saving ? "Сохраняю…" : dirty ? "Сохранить сейчас" : "Revision сохранена"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-amber-900">
            <TriangleAlertIcon className="size-3" /> Неподтверждённых цен: {unconfirmed}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-1 text-neutral-700">
            <HistoryIcon className="size-3" /> Локальных версий: {historyCount}
          </span>
          {dirty ? (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">Автосохранение ожидает паузы</span>
          ) : null}
        </div>
        {saveError ? (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            Не удалось создать новую revision: {saveError}
          </p>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        {estimate.sections.map((section) => (
          <section key={section.id} className="border-b border-neutral-200 last:border-b-0">
            <button
              type="button"
              onClick={() =>
                setOpenSections((current) => ({
                  ...current,
                  [section.id]: !current[section.id]
                }))
              }
              className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-neutral-50 sm:px-5"
            >
              <span className="text-sm font-semibold">
                {section.sortOrder}. {section.name}
              </span>
              <span className="flex items-center gap-3 text-sm">
                <span className="font-semibold tabular-nums">{rub.format(section.subtotal)}</span>
                <ChevronDownIcon
                  className={`size-4 transition ${openSections[section.id] ? "rotate-180" : ""}`}
                />
              </span>
            </button>

            {openSections[section.id] ? (
              <div className="min-w-[920px] border-t border-neutral-100">
                <div className="grid grid-cols-[38px_minmax(250px,1fr)_76px_96px_112px_88px_120px] gap-2 bg-neutral-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 sm:px-5">
                  <span>№</span>
                  <span>Позиция / источник</span>
                  <span>Ед.</span>
                  <span>Кол-во</span>
                  <span>Цена</span>
                  <span>Коэф.</span>
                  <span className="text-right">Сумма</span>
                </div>
                {section.items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[38px_minmax(250px,1fr)_76px_96px_112px_88px_120px] gap-2 border-t border-neutral-100 px-4 py-3 text-xs sm:px-5"
                  >
                    <span className="pt-2 text-neutral-400">{index + 1}</span>
                    <div>
                      <input
                        aria-label={`Название ${item.name}`}
                        value={item.name}
                        onChange={(event) => editItem(section.id, item.id, "name", event.target.value)}
                        className="w-full rounded-md border border-transparent bg-transparent px-1 py-1.5 font-medium outline-none hover:border-neutral-200 focus:border-neutral-400"
                      />
                      <p className="mt-1 px-1 text-[10px] text-neutral-500">
                        {item.priceSource.label} · confidence {item.priceSource.confidence}
                      </p>
                      {item.warning ? (
                        <p className="mt-1 px-1 text-[10px] text-amber-700">{item.warning}</p>
                      ) : null}
                    </div>
                    <input
                      aria-label={`Единица ${item.name}`}
                      value={item.unit}
                      onChange={(event) => editItem(section.id, item.id, "unit", event.target.value)}
                      className="h-8 rounded-md border border-neutral-200 px-2 outline-none focus:border-neutral-500"
                    />
                    <input
                      aria-label={`Количество ${item.name}`}
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.quantity}
                      onChange={(event) => editItem(section.id, item.id, "quantity", event.target.value)}
                      className="h-8 rounded-md border border-neutral-200 px-2 text-right tabular-nums outline-none focus:border-neutral-500"
                    />
                    <input
                      aria-label={`Цена ${item.name}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) => editItem(section.id, item.id, "unitPrice", event.target.value)}
                      className="h-8 rounded-md border border-neutral-200 px-2 text-right tabular-nums outline-none focus:border-neutral-500"
                    />
                    <input
                      aria-label={`Коэффициент ${item.name}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.coefficient}
                      onChange={(event) => editItem(section.id, item.id, "coefficient", event.target.value)}
                      className="h-8 rounded-md border border-neutral-200 px-2 text-right tabular-nums outline-none focus:border-neutral-500"
                    />
                    <span className="pt-2 text-right font-medium tabular-nums">{rub.format(item.amount)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <footer className="grid gap-4 bg-neutral-950 p-4 text-white sm:grid-cols-[1fr_300px] sm:p-5">
        <div>
          <p className="text-xs font-semibold text-neutral-300">Ключевые допущения</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-neutral-400">
            {estimate.assumptions.slice(0, 3).map((value) => (
              <li key={value}>• {value}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-white/8 p-3.5">
          <div className="flex justify-between text-xs text-neutral-300">
            <span>Прямые затраты</span>
            <span>{rub.format(estimate.totals.directCost)}</span>
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-white/10 pt-3">
            <span className="text-sm font-semibold">Итого</span>
            <span className="text-xl font-semibold tabular-nums">{rub.format(estimate.totals.grandTotal)}</span>
          </div>
          <p className="mt-1 text-right text-[10px] text-neutral-500">
            {number.format(estimate.sections.flatMap((section) => section.items).length)} позиций · НДС{" "}
            {estimate.vatRate}%
          </p>
        </div>
      </footer>
    </article>
  );
};
