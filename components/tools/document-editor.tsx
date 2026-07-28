"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheckIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderCircleIcon,
  PrinterIcon,
  SaveIcon,
  XIcon
} from "lucide-react";
import { browserUuid } from "@/lib/platform/browser-crypto";
import { useLocalWorkspace } from "@/lib/local/context";
import { getRepository, type LocalDocument } from "@/lib/local/repository";
import { cn } from "@/lib/utils";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function txt(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalize(args: unknown, id: string): LocalDocument | null {
  const root = rec(args);
  const content = txt(root.content ?? root.body);
  if (!content) return null;
  return {
    id: txt(root.id, id),
    type: txt(root.type, "document"),
    title: txt(root.title, "Новый документ"),
    content,
    missingFields: Array.isArray(root.missingFields)
      ? root.missingFields.filter((item): item is string => typeof item === "string")
      : [],
    status: root.status === "approved" ? "approved" : "draft",
    revision: Math.max(1, Number(root.revision) || 1),
    updatedAt: new Date().toISOString()
  };
}

function html(value: string) {
  if (/<(p|h[1-6]|ul|ol|table|div)\b/i.test(value)) return value;
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const clean = line.trim();
      if (!clean) return "<p><br></p>";
      if (clean === clean.toUpperCase() && clean.length < 100) return `<h2>${clean}</h2>`;
      return `<p>${clean}</p>`;
    })
    .join("");
}

function safeName(value: string) {
  return (
    value
      .replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "prosmet-document"
  );
}

export function DocumentEditor({
  args,
  status
}: {
  args: unknown;
  status?: { type?: string };
}) {
  const fallbackId = useRef(`document_${browserUuid()}`).current;
  const incoming = useMemo(() => normalize(args, fallbackId), [args, fallbackId]);
  const workspace = useLocalWorkspace();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [document, setDocument] = useState<LocalDocument | null>(incoming);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef<string | null>(null);

  useEffect(() => {
    if (!incoming || initialized.current === incoming.id) return;
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const stored = await repository.getDocument(incoming.id);
      if (cancelled) return;
      const next =
        stored ??
        {
          ...incoming,
          threadId: workspace.currentThreadId,
          content: html(incoming.content)
        };
      setDocument(next);
      initialized.current = next.id;
      if (!stored) await repository.saveDocument(next);
      setSaved(true);
    })().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Не удалось открыть документ")
    );
    return () => {
      cancelled = true;
    };
  }, [incoming, workspace.currentThreadId]);

  useEffect(() => {
    if (!document || !editorRef.current) return;
    if (editorRef.current.innerHTML !== document.content) {
      editorRef.current.innerHTML = document.content;
    }
  }, [document?.id, document?.revision]);

  const save = async (nextStatus: LocalDocument["status"] = document?.status ?? "draft") => {
    if (!document) return;
    setBusy(true);
    setError(null);
    try {
      const next: LocalDocument = {
        ...document,
        content: editorRef.current?.innerHTML ?? document.content,
        status: nextStatus,
        revision: document.revision + 1,
        updatedAt: new Date().toISOString(),
        threadId: workspace.currentThreadId
      };
      await (await getRepository()).saveDocument(next, true);
      setDocument(next);
      setSaved(true);
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить документ");
    } finally {
      setBusy(false);
    }
  };

  const downloadDoc = () => {
    if (!document) return;
    const content = `<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;color:#111}h1{text-align:center;font-size:18pt}h2{font-size:13pt;margin-top:16pt}table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:5pt}</style></head><body><h1>${document.title}</h1>${editorRef.current?.innerHTML ?? document.content}</body></html>`;
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/msword;charset=utf-8" })
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName(document.title)}-v${document.revision}.doc`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (status?.type === "running" || !document) {
    return (
      <div className="mt-3 flex w-full max-w-(--thread-max-width) items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-5 py-4 text-sm text-neutral-600 shadow-sm">
        <LoaderCircleIcon className="size-4 animate-spin" /> Формируем печатный документ…
      </div>
    );
  }

  return (
    <section
      data-testid="document-editor"
      className={cn(
        "flex overflow-hidden border border-neutral-200 bg-neutral-100 shadow-sm",
        fullscreen
          ? "fixed inset-0 z-[110] h-dvh flex-col rounded-none"
          : "mt-3 w-full max-w-(--thread-max-width) flex-col rounded-2xl"
      )}
    >
      <header className="flex flex-col gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <FileTextIcon className="size-4" /> Редактируемый документ
            <span className="rounded-full border border-neutral-200 px-2 py-0.5">
              Версия {document.revision}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5",
                document.status === "approved"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-neutral-100"
              )}
            >
              {document.status === "approved" ? "Утверждён" : "Черновик"}
            </span>
            {saved && (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckIcon className="size-3.5" /> IndexedDB
              </span>
            )}
          </div>
          <input
            value={document.title}
            onChange={(event) => {
              setSaved(false);
              setDocument((current) =>
                current ? { ...current, title: event.target.value } : current
              );
            }}
            className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
            aria-label="Название документа"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadDoc}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
          >
            <DownloadIcon className="size-4" /> DOC
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
          >
            <PrinterIcon className="size-4" /> PDF / печать
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((value) => !value)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium hover:bg-neutral-50"
          >
            {fullscreen ? <XIcon className="size-4" /> : null}
            {fullscreen ? "Свернуть" : "Развернуть"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save("approved")}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            <BadgeCheckIcon className="size-4" /> Утвердить
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            {saved ? "Сохранено" : "Сохранить"}
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="prosmet-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-[1080px] gap-5 xl:grid-cols-[minmax(0,794px)_250px]">
          <article className="print-page min-h-[1123px] bg-white px-[8%] py-[8%] shadow-[0_1px_6px_rgba(0,0,0,0.16)]">
            <h1 className="mb-10 text-center text-xl font-semibold leading-tight">
              {document.title}
            </h1>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              onInput={(event) => {
                setSaved(false);
                setDocument((current) =>
                  current ? { ...current, content: event.currentTarget.innerHTML } : current
                );
              }}
              aria-label="Текст документа"
              className="prosmet-document min-h-[850px] outline-none"
            />
          </article>
          <aside className="no-print space-y-4 xl:sticky xl:top-0 xl:self-start">
            <section className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-semibold">Проверка реквизитов</h3>
              {document.missingFields.length ? (
                <ul className="mt-3 space-y-2 text-sm text-amber-800">
                  {document.missingFields.map((field) => (
                    <li key={field} className="rounded-lg bg-amber-50 px-3 py-2">
                      {field}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-6 text-emerald-700">
                  Обязательные пропуски не заявлены. Перед печатью проверьте реквизиты,
                  даты и суммы.
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}
