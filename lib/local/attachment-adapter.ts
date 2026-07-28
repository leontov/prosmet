"use client";

import type {
  Attachment,
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment
} from "@assistant-ui/react";
import { browserUuid } from "@/lib/platform/browser-crypto";
import { deleteFile, loadFile, storeFile, toDataUrl } from "@/lib/local/files";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_INLINE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

const textExtensions = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "html",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "py",
  "sql"
]);

function extension(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("ru-RU") ?? "";
}

function isText(name: string, mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    ["application/json", "application/xml", "application/yaml"].includes(mimeType) ||
    textExtensions.has(extension(name))
  );
}

export class ProsmetAttachmentAdapter implements AttachmentAdapter {
  accept =
    "image/*,application/pdf,text/*,application/json,.csv,.tsv,.json,.xml,.yaml,.yml,.md,.doc,.docx,.rtf,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.ifc";

  constructor(private readonly threadId: string) {}

  async add({ file }: { file: File }): Promise<PendingAttachment> {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`Файл больше ${MAX_FILE_BYTES / 1024 / 1024} МБ.`);
    }
    const id = `attachment_${browserUuid()}`;
    await storeFile(file, this.threadId, id);
    return {
      id,
      type: file.type.startsWith("image/") ? "image" : "document",
      name: file.name,
      contentType: file.type || "application/octet-stream",
      file,
      status: { type: "requires-action", reason: "composer-send" }
    };
  }

  async remove(attachment: Attachment) {
    await deleteFile(attachment.id);
  }

  async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const stored = await loadFile(attachment.id);
    if (!stored) throw new Error(`Файл «${attachment.name}» отсутствует в локальном кэше.`);

    if (isText(stored.name, stored.mimeType)) {
      if (stored.sizeBytes > MAX_TEXT_BYTES) {
        throw new Error(`Текстовый файл «${stored.name}» больше 2 МБ. Разделите его на части.`);
      }
      const text = new TextDecoder("utf-8", { fatal: false }).decode(stored.bytes);
      return {
        ...attachment,
        type: "document",
        status: { type: "complete" },
        content: [
          {
            type: "text",
            text: `<attachment name="${stored.name}" mime="${stored.mimeType}">\n${text}\n</attachment>`
          }
        ]
      };
    }

    if (stored.sizeBytes > MAX_INLINE_BYTES) {
      throw new Error(`Файл «${stored.name}» сохранён локально, но для AI должен быть не больше 10 МБ.`);
    }

    const dataUrl = toDataUrl(stored.bytes, stored.mimeType);
    if (stored.mimeType.startsWith("image/")) {
      return {
        ...attachment,
        type: "image",
        status: { type: "complete" },
        content: [{ type: "image", image: dataUrl, filename: stored.name }]
      };
    }

    return {
      ...attachment,
      type: "document",
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data: dataUrl,
          mimeType: stored.mimeType,
          filename: stored.name
        }
      ]
    } as CompleteAttachment;
  }
}
