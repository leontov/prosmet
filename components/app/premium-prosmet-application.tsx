"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { PremiumChatWorkspace } from "@/components/app/premium-chat-workspace";
import {
  PremiumEstimateWorkspaceEditor,
  type PremiumEstimateWorkspaceBusy,
  type PremiumEstimateWorkspaceMode,
  type PremiumEstimateWorkspaceSaveState
} from "@/components/app/premium-estimate-workspace-editor";
import { cloneEstimate, validateForApproval, type EstimateDraft } from "@/lib/domain/estimate";
import { verifyEstimateWithRust } from "@/lib/client/rust-engine";
import { verifyEstimateWithRust } from "@/lib/client/rust-engine";
import { exportEstimatePdf, exportEstimateXlsx } from "@/lib/exports/estimate";
import { useLocalWorkspace } from "@/lib/local/context";
import { recordEstimatePriceStatus } from "@/lib/local/price-intelligence";
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

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function elementFromEventTarget(target: EventTarget | null) {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function compactSupportingArtifacts() {
  const estimates = document.querySelectorAll<HTMLElement>('[data-testid="estimate-document-experience"]');
  for (const estimate of estimates) {
    const group = estimate.closest<HTMLElement>(".space-y-3");
    if (!group) continue;
    group.dataset.prosmetCompactToolStack = "true";
    for (const child of Array.from(group.children)) {
      const element = child as HTMLElement;
      if (element === estimate || element.contains(estimate)) {
        element.removeAttribute("data-prosmet-supporting-artifact");
      } else {
        element.dataset.prosmetSupportingArtifact = "true";
      }
    }
  }
}

export function PremiumProsmetApplication() {
  const workspace = useLocalWorkspace();
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [mode, setMode] = useState<PremiumEstimateWorkspaceMode>("edit");
  const [saveState, setSaveState] = useState<PremiumEstimateWorkspaceSaveState>("saved");
  const [busy, setBusy] = useState<PremiumEstimateWorkspaceBusy>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<EstimateDraft | null>(null);
  const dirty = useRef(false);
  const editVersion = useRef(0);
  const activeEstimateId = draft?.id ?? null;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const openEstimate = useCallback(async (title: string) => {
    setError(null);
    setShareOpen(false);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const estimates = (await (await getRepository()).listEstimates()).filter((estimate) => !estimate.deletedAt);
      const selected = estimates.find((estimate) => estimate.title.trim() === title.trim()) ?? estimates[0];
      if (selected) {
        dirty.current = false;
        editVersion.current = 0;
        setDraft(selected);
        setMode("edit");
        setSaveState(navigator.onLine ? "saved" : "offline");
        return;
      }
      await delay(75);
    }
    setError("Смета ещё сохраняется. Откройте карточку повторно через секунду.");
  }, []);

  useEffect(() => {
    const handleOpen = (event: MouseEvent) => {
      const target = elementFromEventTarget(event.target);
      const button = target?.closest<HTMLElement>('[data-testid="estimate-artifact-card"] > button');
      if (!button) return;
      const card = button.closest<HTMLElement>('[data-testid="estimate-artifact-card"]');
      const title = card?.querySelector("h3")?.textContent?.trim() ?? "";
      if (!title) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openEstimate(title);
    };
    document.addEventListener("click", handleOpen, true);
    return () => document.removeEventListener("click", handleOpen, true);
  }, [openEstimate]);

  useEffect(() => {
    compactSupportingArtifacts();
    const observer = new MutationObserver(compactSupportingArtifacts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeEstimateId) return;
    const body = document.body;
    body.dataset.prosmetEstimateOpen = "true";

    const updateSidebarWidth = () => {
      const sidebars = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="app-sidebar"]'));
      const visible = sidebars.find((sidebar) => {
        const rect = sidebar.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      body.style.setProperty("--prosmet-sidebar-width", `${Math.round(visible?.getBoundingClientRect().width ?? 0)}px`);
    };

    updateSidebarWidth();
    window.addEventListener("resize", updateSidebarWidth);
    const observer = new MutationObserver(updateSidebarWidth);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["class"] });

    return () => {
      window.removeEventListener("resize", updateSidebarWidth);
      observer.disconnect();
      delete body.dataset.prosmetEstimateOpen;
      body.style.removeProperty("--prosmet-sidebar-width");
    };
  }, [activeEstimateId]);

  const changeDraft = useCallback((updater: (current: EstimateDraft) => EstimateDraft) => {
    setDraft((current) => {
      if (!current) return current;
      const next = updater(cloneEstimate(current));
      dirty.current = true;
      editVersion.current += 1;
      setSaveState(navigator.onLine ? "saving" : "offline");
      setError(null);
      return {
        ...next,
        status: next.status === "approved" || next.status === "sent" ? "draft" : next.status,
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  useEffect(() => {
    if (!draft || !dirty.current) return;
    const version = editVersion.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await (await getRepository()).saveEstimate(workspace.currentThreadId, draft);
          if (version === editVersion.current) dirty.current = false;
          setSaveState(navigator.onLine ? "saved" : "offline");
          window.dispatchEvent(new Event("prosmet:local-data-changed"));
        } catch (reason) {
          setSaveState("error");
          setError(reason instanceof Error ? reason.message : "Автосохранение не выполнено");
        }
      })();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [draft, workspace.currentThreadId]);

  const closeWorkspace = useCallback(async () => {
    const current = draftRef.current;
    if (current && dirty.current) {
      try {
        await (await getRepository()).saveEstimate(workspace.currentThreadId, current);
        dirty.current = false;
        window.dispatchEvent(new Event("prosmet:local-data-changed"));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Смета не сохранена");
        return;
      }
    }
    setShareOpen(false);
    setDraft(null);
    setMode("edit");
    setBusy(null);
  }, [workspace.currentThreadId]);

  const saveVersion = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    setBusy("finish");
    setError(null);
    try {
      const next: EstimateDraft = {
        ...cloneEstimate(current),
        status: "review",
        revision: current.revision + 1,
        updatedAt: new Date().toISOString()
      };
      await (await getRepository()).saveEstimate(workspace.currentThreadId, next, true);
      dirty.current = false;
      editVersion.current += 1;
      setDraft(next);
      setSaveState(navigator.onLine ? "saved" : "offline");
      setMode("preview");
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : "Версия сметы не сохранена");
    } finally {
      setBusy(null);
    }
  }, [workspace.currentThreadId]);

  const approve = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    const validation = validateForApproval(current);
    if (!validation.canApprove) {
      setError(`Смету нельзя утвердить:\n${validation.blockers.slice(0, 6).map((item) => `• ${item}`).join("\n")}`);
      return;
    }

    setBusy("approve");
    setError(null);
    try {
      await verifyEstimateWithRust(current);
      const approved: EstimateDraft = {
        ...cloneEstimate(current),
        status: "approved",
        revision: current.revision + 1,
        updatedAt: new Date().toISOString()
      };
      const repository = await getRepository();
      await repository.saveEstimate(workspace.currentThreadId, approved, true);
      await repository.saveConfirmedPrices(approved);
      await recordEstimatePriceStatus(approved, "approved");
      dirty.current = false;
      editVersion.current += 1;
      setDraft(approved);
      setSaveState(navigator.onLine ? "saved" : "offline");
      setMode("preview");
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setSaveState("error");
      setError(reason instanceof Error ? reason.message : "Смета не утверждена");
    } finally {
      setBusy(null);
    }
  }, [workspace.currentThreadId]);

  const runExport = useCallback(async (kind: "pdf" | "xlsx") => {
    const current = draftRef.current;
    if (!current) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "pdf") await exportEstimatePdf(current);
      else await exportEstimateXlsx(current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : kind === "pdf" ? "PDF не сформирован" : "Excel не сформирован");
    } finally {
      setBusy(null);
    }
  }, []);

  const deliver = useCallback(async (channel: EstimateShareChannel) => {
    const current = draftRef.current;
    if (!current) return;
    setBusy("share");
    setError(null);
    try {
      const sent: EstimateDraft = {
        ...cloneEstimate(current),
        status: "sent",
        revision: current.revision + 1,
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

      dirty.current = false;
      editVersion.current += 1;
      setDraft(sent);
      setSaveState(navigator.onLine ? "saved" : "offline");
      setShareOpen(false);
      setMode("preview");
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось передать смету");
    } finally {
      setBusy(null);
    }
  }, [workspace.currentThreadId]);

  return (
    <>
      <PremiumChatWorkspace />
      {draft ? (
        <PremiumEstimateWorkspaceEditor
          draft={draft}
          mode={mode}
          saveState={saveState}
          busy={busy}
          error={error}
          onChange={changeDraft}
          onClose={() => void closeWorkspace()}
          onSaveVersion={() => void saveVersion()}
          onApprove={() => void approve()}
          onEdit={() => setMode("edit")}
          onExportPdf={() => void runExport("pdf")}
          onExportXlsx={() => void runExport("xlsx")}
          onShare={() => setShareOpen(true)}
        />
      ) : null}
      {draft && shareOpen ? (
        <PremiumEstimateShareDialog busy={busy === "share"} onClose={() => setShareOpen(false)} onDeliver={(channel) => void deliver(channel)} />
      ) : null}
    </>
  );
}

function PremiumEstimateShareDialog({ busy, onClose, onDeliver }: { busy: boolean; onClose: () => void; onDeliver: (channel: EstimateShareChannel) => void }) {
  return (
    <div className="fixed inset-0 z-[320] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Передача сметы клиенту">
      <button type="button" className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-label="Закрыть передачу сметы" onClick={onClose} />
      <section className="relative w-full max-w-lg rounded-t-3xl border border-black/10 bg-white p-5 pb-[max(22px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Передать смету клиенту</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-500">Выберите канал. Версия и подтверждённые цены сохранятся автоматически.</p>
          </div>
          <button type="button" onClick={onClose} className="prosmet-premium-icon-button" aria-label="Закрыть">×</button>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {canUseNativeEstimateShare() ? <ShareButton disabled={busy} onClick={() => onDeliver("native")}>Системная отправка</ShareButton> : null}
          <ShareButton disabled={busy} onClick={() => onDeliver("whatsapp")}>WhatsApp</ShareButton>
          <ShareButton disabled={busy} onClick={() => onDeliver("email")}>Электронная почта</ShareButton>
          <ShareButton disabled={busy} onClick={() => onDeliver("pdf")}>Скачать PDF</ShareButton>
          <ShareButton disabled={busy} onClick={() => onDeliver("clipboard")}>Скопировать итог</ShareButton>
        </div>
      </section>
    </div>
  );
}

function ShareButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-12 rounded-xl border border-neutral-200 bg-white px-4 text-left text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50">{children}</button>;
}
