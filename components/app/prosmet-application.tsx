"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatWorkspace } from "@/components/app/chat-workspace";
import {
  EstimateWorkspaceEditor,
  type EstimateWorkspaceMode,
  type EstimateWorkspaceSaveState
} from "@/components/app/estimate-workspace-editor";
import {
  calculateEstimate,
  cloneEstimate,
  type EstimateDraft
} from "@/lib/domain/estimate";
import { exportEstimatePdf, exportEstimateXlsx } from "@/lib/exports/estimate";
import { useLocalWorkspace } from "@/lib/local/context";
import { getRepository } from "@/lib/local/repository";
import { formatMoney } from "@/lib/utils";

type BusyState = "finish" | "pdf" | "xlsx" | "share" | null;

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function elementFromEventTarget(target: EventTarget | null) {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

function compactSupportingArtifacts() {
  const estimates = document.querySelectorAll<HTMLElement>(
    '[data-testid="estimate-document-experience"]'
  );

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

export function ProsmetApplication() {
  const workspace = useLocalWorkspace();
  const [draft, setDraft] = useState<EstimateDraft | null>(null);
  const [mode, setMode] = useState<EstimateWorkspaceMode>("edit");
  const [saveState, setSaveState] = useState<EstimateWorkspaceSaveState>("saved");
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef<EstimateDraft | null>(null);
  const dirty = useRef(false);
  const editVersion = useRef(0);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const openEstimate = useCallback(async (title: string) => {
    setError(null);
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const estimates = (await (await getRepository()).listEstimates()).filter(
        (estimate) => !estimate.deletedAt
      );
      const selected =
        estimates.find((estimate) => estimate.title.trim() === title.trim()) ?? estimates[0];
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
    setError("Смета ещё не успела сохраниться. Откройте карточку повторно.");
  }, []);

  useEffect(() => {
    const handleOpen = (event: MouseEvent) => {
      const target = elementFromEventTarget(event.target);
      const button = target?.closest<HTMLElement>(
        '[data-testid="estimate-artifact-card"] > button'
      );
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
    if (!draft) return;
    const body = document.body;
    body.dataset.prosmetEstimateOpen = "true";

    const updateSidebarWidth = () => {
      const sidebars = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="app-sidebar"]')
      );
      const visible = sidebars.find((sidebar) => {
        const rect = sidebar.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      body.style.setProperty(
        "--prosmet-sidebar-width",
        `${Math.round(visible?.getBoundingClientRect().width ?? 0)}px`
      );
    };

    updateSidebarWidth();
    window.addEventListener("resize", updateSidebarWidth);
    const observer = new MutationObserver(updateSidebarWidth);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style"]
    });

    return () => {
      window.removeEventListener("resize", updateSidebarWidth);
      observer.disconnect();
      delete body.dataset.prosmetEstimateOpen;
      body.style.removeProperty("--prosmet-sidebar-width");
    };
  }, [draft]);

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
        status:
          next.status === "approved" || next.status === "sent" ? "draft" : next.status,
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
    setDraft(null);
    setMode("edit");
    setBusy(null);
  }, [workspace.currentThreadId]);

  const finish = useCallback(async () => {
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

  const runExport = useCallback(
    async (kind: "pdf" | "xlsx") => {
      const current = draftRef.current;
      if (!current) return;
      setBusy(kind);
      setError(null);
      try {
        if (kind === "pdf") await exportEstimatePdf(current);
        else await exportEstimateXlsx(current);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : kind === "pdf"
              ? "PDF не сформирован"
              : "Excel не сформирован"
        );
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const share = useCallback(async () => {
    const current = draftRef.current;
    if (!current) return;
    setBusy("share");
    setError(null);
    try {
      const total = calculateEstimate(current).total;
      const text = [
        current.title,
        current.objectName || "Объект не указан",
        `Итого: ${formatMoney(total, current.currency)}`
      ].join("\n");
      if (navigator.share) {
        await navigator.share({ title: current.title, text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Системная отправка недоступна в этом браузере");
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Не удалось поделиться сметой");
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <>
      <ChatWorkspace />
      {draft ? (
        <EstimateWorkspaceEditor
          draft={draft}
          mode={mode}
          saveState={saveState}
          busy={busy}
          error={error}
          onChange={changeDraft}
          onClose={() => void closeWorkspace()}
          onFinish={() => void finish()}
          onEdit={() => setMode("edit")}
          onExportPdf={() => void runExport("pdf")}
          onExportXlsx={() => void runExport("xlsx")}
          onShare={() => void share()}
        />
      ) : null}
    </>
  );
}
