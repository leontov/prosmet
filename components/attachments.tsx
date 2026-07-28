"use client";

import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState
} from "@assistant-ui/react";
import {
  AlertCircleIcon,
  FileTextIcon,
  ImageIcon,
  LoaderCircleIcon,
  PaperclipIcon,
  XIcon
} from "lucide-react";
import { useEffect, useState, type FC } from "react";

function useObjectUrl(file: File | undefined) {
  const [url, setUrl] = useState<string | undefined>();

  useEffect(() => {
    if (!file) {
      const frame = window.requestAnimationFrame(() => setUrl(undefined));
      return () => window.cancelAnimationFrame(frame);
    }

    const next = URL.createObjectURL(file);
    const frame = window.requestAnimationFrame(() => setUrl(next));
    return () => {
      window.cancelAnimationFrame(frame);
      URL.revokeObjectURL(next);
    };
  }, [file]);

  return file ? url : undefined;
}

const AttachmentTile: FC<{ removable: boolean }> = ({ removable }) => {
  const name = useAuiState((state) => state.attachment.name);
  const type = useAuiState((state) => state.attachment.type);
  const file = useAuiState((state) => state.attachment.file);
  const status = useAuiState((state) => state.attachment.status);
  const remoteImage = useAuiState((state) => {
    if (state.attachment.type !== "image") return undefined;
    return state.attachment.content?.find((part) => part.type === "image")?.image;
  });
  const preview = useObjectUrl(file) ?? remoteImage;
  const running = status.type === "running";
  const failed = status.type === "incomplete" && status.reason === "error";
  const errorMessage = failed ? status.message ?? "Не удалось загрузить файл" : null;

  return (
    <AttachmentPrimitive.Root className="group relative flex min-w-0 max-w-56 items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2 shadow-sm">
      <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-500">
        {type === "image" && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : type === "image" ? (
          <ImageIcon className="size-4" />
        ) : (
          <FileTextIcon className="size-4" />
        )}
        {running ? (
          <span className="absolute inset-0 grid place-items-center bg-white/75">
            <LoaderCircleIcon className="size-4 animate-spin" aria-label="Загрузка файла" />
          </span>
        ) : null}
        {failed ? (
          <span className="absolute inset-0 grid place-items-center bg-red-50/90 text-red-600">
            <AlertCircleIcon className="size-4" aria-label="Ошибка загрузки" />
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-neutral-800">
          <AttachmentPrimitive.Name />
        </span>
        <p className={`truncate text-[10px] ${failed ? "text-red-600" : "text-neutral-500"}`}>
          {errorMessage ?? (running ? "Загрузка…" : type === "image" ? "Изображение" : "Документ")}
        </p>
      </div>
      {removable ? (
        <AttachmentPrimitive.Remove asChild>
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={`Удалить вложение ${name}`}
          >
            <XIcon className="size-3.5" />
          </button>
        </AttachmentPrimitive.Remove>
      ) : null}
    </AttachmentPrimitive.Root>
  );
};

export const ComposerAttachments: FC = () => (
  <div className="flex w-full gap-2 overflow-x-auto px-1 empty:hidden">
    <ComposerPrimitive.Attachments>
      {() => <AttachmentTile removable />}
    </ComposerPrimitive.Attachments>
  </div>
);

export const UserMessageAttachments: FC = () => (
  <div className="mb-2 flex flex-wrap justify-end gap-2 empty:hidden">
    <MessagePrimitive.Attachments>
      {() => <AttachmentTile removable={false} />}
    </MessagePrimitive.Attachments>
  </div>
);

export const ComposerAddAttachment: FC = () => (
  <ComposerPrimitive.AddAttachment asChild multiple>
    <button
      type="button"
      className="rounded-full p-2 text-neutral-500 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Добавить вложение"
    >
      <PaperclipIcon className="size-4" />
    </button>
  </ComposerPrimitive.AddAttachment>
);
