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
import type { FC } from "react";
import { cn } from "@/lib/utils";

const AttachmentTile: FC<{ composer?: boolean }> = ({ composer = false }) => {
  const type = useAuiState((state) => state.attachment.type);
  const status = useAuiState((state) => state.attachment.status);
  const failed = status.type === "incomplete" && status.reason === "error";
  const uploading = status.type === "running";

  return (
    <AttachmentPrimitive.Root
      className={cn(
        "relative flex max-w-64 items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm",
        failed && "border-red-200 bg-red-50"
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
        {uploading ? (
          <LoaderCircleIcon className="size-4 animate-spin" />
        ) : failed ? (
          <AlertCircleIcon className="size-4 text-red-600" />
        ) : type === "image" ? (
          <ImageIcon className="size-4" />
        ) : (
          <FileTextIcon className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <AttachmentPrimitive.Name className="block truncate text-xs font-medium" />
        <span className="block text-[10px] text-neutral-500">
          {uploading ? "Сохраняем локально…" : failed ? "Ошибка загрузки" : "Прикреплено"}
        </span>
      </div>
      {composer && (
        <AttachmentPrimitive.Remove asChild>
          <button
            type="button"
            aria-label="Удалить вложение"
            className="flex size-6 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-800"
          >
            <XIcon className="size-3.5" />
          </button>
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
};

export const ComposerAttachments: FC = () => (
  <div className="flex w-full gap-2 overflow-x-auto px-1 empty:hidden">
    <ComposerPrimitive.Attachments>{() => <AttachmentTile composer />}</ComposerPrimitive.Attachments>
  </div>
);

export const UserMessageAttachments: FC = () => (
  <div className="mb-2 flex flex-wrap justify-end gap-2">
    <MessagePrimitive.Attachments>{() => <AttachmentTile />}</MessagePrimitive.Attachments>
  </div>
);

export const ComposerAddAttachment: FC = () => (
  <ComposerPrimitive.AddAttachment asChild>
    <button
      type="button"
      aria-label="Добавить вложение"
      title="Добавить вложение"
      className="flex size-8 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
    >
      <PaperclipIcon className="size-4" />
    </button>
  </ComposerPrimitive.AddAttachment>
);
