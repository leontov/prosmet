"use client";

import { useAuiState } from "@assistant-ui/react";
import {
  CheckIcon,
  ClipboardIcon,
  DownloadIcon,
  FileTextIcon,
  MailIcon,
  MessageCircleIcon,
  SendIcon,
  Share2Icon,
  ShieldCheckIcon,
  SmartphoneIcon,
  XIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EstimateEditor } from "@/components/tools/estimate-editor";
import {
  EstimateDraftSchema,
  calculateEstimate,
  cloneEstimate,
  validateForApproval,
  type EstimateDraft
} from "@/lib/domain/estimate";
import { extractSiteIntake } from "@/lib/domain/site-intake";
import { useLocalWorkspace } from "@/lib/local/context";
import { getRepository } from "@/lib/local/repository";
import {
  canUseNativeEstimateShare,
  copyEstimateSummary,
  downloadEstimateForSharing,
  estimateShareText,
  openEstimateEmail,
  openEstimateWhatsApp,
  shareEstimateNative,
  type EstimateShareChannel
} from "@/lib/sharing/estimate";
import { cn, formatMoney } from "@/lib/utils";

function estimateIdFromArgs(args: unknown) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const id = (args as Record<string, unknown>).id;
  return typeof id === "string" && id ? id : null;
}

function contentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const item = part as Record<string, unknown>;
      return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
    })
    .join("\n")
    .trim();
}

function channelLabel(channel: EstimateShareChannel) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "электронную почту";
  if (channel === "native") return "системное меню телефона";
  if (channel === "clipboard") return "буфер обмена";
  return "PDF";
}

export function EstimateExperience({
  args,
  status
}: {
  args: unknown;
  status?: { type?: string };
}) {
  const workspace = useLocalWorkspace();
  const latestUserInput = useAuiState((state) => {
    for (let index = state.thread.messages.length - 1; index >= 0; index -= 1) {
      const message = state.thread.messages[index];
      if (message?.role === "user") return contentText(message.content);
    }
    return "";
  });
  const intake = useMemo(() => extractSiteIntake(latestUserInput), [latestUserInput]);
  const incoming = useMemo(() => {
    const parsed = EstimateDraftSchema.safeParse(args);
    return parsed.success ? parsed.data : null;
  }, [args]);
  const estimateId = incoming?.id ?? estimateIdFromArgs(args);
  const [latest, setLatest] = useState<EstimateDraft | null>(incoming);
  const [shareOpen, setShareOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorEpoch, setEditorEpoch] = useState(0);

  useEffect(() => {
    if (!estimateId) return;
    let cancelled = false;
    const load = async () => {
      const stored = await (await getRepository()).getEstimate(estimateId);
      if (!cancelled && stored) setLatest(stored);
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("prosmet:local-data-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("prosmet:local-data-changed", refresh);
    };
  }, [estimateId]);

  useEffect(() => {
    if (!estimateId || (!intake.objectName && !intake.customer)) return;
    let cancelled = false;
    void (async () => {
      const repository = await getRepository();
      const current = (await repository.getEstimate(estimateId)) ?? incoming;
      if (!current) return;
      const objectName =
        intake.objectName &&
        (!current.objectName.trim() || current.objectName === "Строительный объект")
          ? intake.objectName
          : current.objectName;
      const customer = intake.customer && !current.customer.trim() ? intake.customer : current.customer;
      if (objectName === current.objectName && customer === current.customer) return;

      const enriched: EstimateDraft = {
        ...cloneEstimate(current),
        objectName,
        customer,
        updatedAt: new Date().toISOString()
      };
      await repository.saveEstimate(workspace.currentThreadId, enriched);
      if (cancelled) return;
      setLatest(enriched);
      setEditorEpoch((value) => value + 1);
      window.dispatchEvent(new Event("prosmet:local-data-changed"));
    })().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "Не удалось заполнить данные объекта")
    );
    return () => {
      cancelled = true;
    };
  }, [estimateId, incoming, intake.customer, intake.objectName, workspace.currentThreadId]);

  const reloadLatest = async (waitForAutosave = false) => {
    if (!estimateId) return incoming;
    if (waitForAutosave) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 760));
    }
    return (await (await getRepository()).getEstimate(estimateId)) ?? incoming;
  };

  const persistStatus = async (
    draft: EstimateDraft,
    nextStatus: "approved" | "sent"
  ) => {
    if (draft.status === nextStatus) return draft;
    const next: EstimateDraft = {
      ...cloneEstimate(draft),
      status: nextStatus,
      revision: draft.revision + 1,
      updatedAt: new Date().toISOString()
    };
    const repository = await getRepository();
    await repository.saveEstimate(workspace.currentThreadId, next, true);
    await repository.saveConfirmedPrices(next);
    setLatest(next);
    setEditorEpoch((value) => value + 1);
    window.dispatchEvent(new Event("prosmet:local-data-changed"));
    return next;
  };

  const prepareShare = async () => {
    setPreparing(true);
    setMessage(null);
    setError(null);
    try {
      let draft = await reloadLatest(true);
      if (!draft) throw new Error("Смета ещё не готова к передаче");

      if (draft.status !== "approved" && draft.status !== "sent") {
        const validation = validateForApproval(draft);
        if (!validation.canApprove) {
          throw new Error(
            `Перед отправкой устраните замечания:\n${validation.blockers
              .slice(0, 6)
              .map((item) => `• ${item}`)
              .join("\n")}`
          );
        }
        draft = await persistStatus(draft, "approved");
      }

      setLatest(draft);
      setShareOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось подготовить смету");
    } finally {
      setPreparing(false);
    }
  };

  const markDelivered = async (channel: EstimateShareChannel) => {
    const draft = (await reloadLatest()) ?? latest;
    if (!draft) return;
    const sent = await persistStatus(draft, "sent");
    await (await getRepository()).setMeta(
      `estimate.share.${sent.id}`,
      JSON.stringify({
        channel,
        sharedAt: new Date().toISOString(),
        revision: sent.revision
      })
    );
    setShareOpen(false);
    setMessage(`Смета передана через ${channelLabel(channel)} и отмечена как отправленная.`);
  };

  const calculation = latest ? calculateEstimate(latest) : null;
  const showHandoff = status?.type !== "running" && latest !== null;

  return (
    <div className="relative">
      {showHandoff ? (
        <section
          className="mt-3 flex w-full max-w-(--thread-max-width) flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/75 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
          data-testid="estimate-handoff"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
              <SmartphoneIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-emerald-950">Смета для работы на объекте</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  {latest.status === "sent"
                    ? "Передана клиенту"
                    : latest.status === "approved"
                      ? "Готова к отправке"
                      : "Автосохранение"}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-emerald-800/80">
                Измените объёмы и цены прямо ниже. Перед отправкой приложение сохранит версию,
                проверит смету и подготовит PDF.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] text-emerald-700/70">Итого</div>
              <div className="text-base font-semibold text-emerald-950">
                {formatMoney(calculation?.total ?? 0, latest.currency)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void prepareShare()}
              disabled={preparing}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
              aria-label="Поделиться сметой с клиентом"
            >
              <Share2Icon className={cn("size-4", preparing && "animate-pulse")} />
              {preparing ? "Проверяем…" : "Передать клиенту"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="mt-2 w-full max-w-(--thread-max-width) whitespace-pre-line rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-2 flex w-full max-w-(--thread-max-width) items-start gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700">
          <CheckIcon className="mt-0.5 size-4 shrink-0" /> {message}
        </div>
      ) : null}

      <EstimateEditor key={`${estimateId ?? "estimate"}:${editorEpoch}`} args={args} status={status} />

      {shareOpen && latest ? (
        <EstimateShareSheet
          draft={latest}
          onClose={() => setShareOpen(false)}
          onDelivered={markDelivered}
        />
      ) : null}
    </div>
  );
}

function EstimateShareSheet({
  draft,
  onClose,
  onDelivered
}: {
  draft: EstimateDraft;
  onClose: () => void;
  onDelivered: (channel: EstimateShareChannel) => Promise<void>;
}) {
  const [busy, setBusy] = useState<EstimateShareChannel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = calculateEstimate(draft).total;
  const nativeShare = canUseNativeEstimateShare();

  const run = async (
    channel: EstimateShareChannel,
    action: () => Promise<"delivered" | "done" | "cancelled">
  ) => {
    setBusy(channel);
    setNotice(null);
    setError(null);
    try {
      const result = await action();
      if (result === "delivered") await onDelivered(channel);
      if (result === "done") {
        setNotice(
          channel === "clipboard"
            ? "Краткая смета скопирована. Вставьте её в сообщение клиенту."
            : "PDF сохранён на устройстве. Его можно прикрепить в любом мессенджере."
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось передать смету");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:px-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        aria-label="Закрыть передачу сметы"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Передать смету клиенту"
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] border border-neutral-200 bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-[24px] sm:p-5"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <SendIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-[-0.025em] text-neutral-950">
                Передать смету клиенту
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-500">
                Выберите привычный способ. Для телефона лучше системное меню или WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <XIcon className="size-4" />
          </button>
        </header>

        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-start gap-3">
            <FileTextIcon className="mt-0.5 size-5 shrink-0 text-neutral-500" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-neutral-900">{draft.title}</div>
              <div className="mt-1 truncate text-xs text-neutral-500">
                {draft.objectName || "Объект не указан"}
                {draft.customer ? ` · ${draft.customer}` : ""}
              </div>
              <div className="mt-3 text-xl font-semibold tracking-[-0.03em] text-neutral-950">
                {formatMoney(total, draft.currency)}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                <ShieldCheckIcon className="size-3.5" /> Проверена · версия {draft.revision}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {nativeShare ? (
            <ShareAction
              label="Поделиться PDF"
              detail="Меню телефона или браузера"
              icon={<Share2Icon />}
              primary
              busy={busy === "native"}
              onClick={() =>
                void run("native", async () => {
                  const result = await shareEstimateNative(draft);
                  if (result.status === "cancelled") return "cancelled";
                  if (result.status === "unsupported") {
                    throw new Error("Системное меню недоступно. Используйте WhatsApp, почту или PDF.");
                  }
                  return "delivered";
                })
              }
            />
          ) : null}
          <ShareAction
            label="WhatsApp"
            detail="Открыть готовое сообщение"
            icon={<MessageCircleIcon />}
            busy={busy === "whatsapp"}
            onClick={() =>
              void run("whatsapp", async () => {
                openEstimateWhatsApp(draft);
                return "delivered";
              })
            }
          />
          <ShareAction
            label="Электронная почта"
            detail="Тема и текст уже заполнены"
            icon={<MailIcon />}
            busy={busy === "email"}
            onClick={() =>
              void run("email", async () => {
                openEstimateEmail(draft);
                return "delivered";
              })
            }
          />
          <ShareAction
            label="Скачать PDF"
            detail="Прикрепить вручную"
            icon={<DownloadIcon />}
            busy={busy === "pdf"}
            onClick={() =>
              void run("pdf", async () => {
                await downloadEstimateForSharing(draft);
                return "done";
              })
            }
          />
          <ShareAction
            label="Скопировать итог"
            detail="Для любого мессенджера"
            icon={<ClipboardIcon />}
            busy={busy === "clipboard"}
            onClick={() =>
              void run("clipboard", async () => {
                await copyEstimateSummary(draft);
                return "done";
              })
            }
          />
        </div>

        {!nativeShare ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            Системная отправка файла недоступна в этом браузере. WhatsApp, почта, копирование и
            загрузка PDF продолжают работать.
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
            {error}
          </p>
        ) : null}

        <details className="mt-4 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-xs text-neutral-600">
          <summary className="cursor-pointer font-medium text-neutral-800">Текст сообщения клиенту</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans leading-5 text-neutral-500">
            {estimateShareText(draft)}
          </pre>
        </details>
      </section>
    </div>
  );
}

function ShareAction({
  label,
  detail,
  icon,
  primary = false,
  busy,
  onClick
}: {
  label: string;
  detail: string;
  icon: React.ReactNode;
  primary?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-50",
        primary
          ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
          : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
          primary ? "bg-white/15" : "bg-neutral-100 text-neutral-600"
        )}
      >
        {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className={cn("mt-0.5 block text-[11px]", primary ? "text-white/75" : "text-neutral-500")}>
          {detail}
        </span>
      </span>
    </button>
  );
}
