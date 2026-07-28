import type {
  Attachment,
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment
} from "@assistant-ui/react";

type UploadedPendingAttachment = PendingAttachment & {
  key: string;
  url: string;
  sha256: string;
};

const ACCEPTED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
  ".ifc"
].join(",");

export const attachmentAdapter: AttachmentAdapter = {
  accept: ACCEPTED,

  async add({ file }) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/files", { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "upload_failed" })) as { error?: string };
      throw new Error(payload.error ?? `upload_failed_${response.status}`);
    }
    const uploaded = await response.json() as { id: string; url: string; sha256: string; contentType: string };
    return {
      id: uploaded.id,
      key: uploaded.id,
      type: uploaded.contentType.startsWith("image/") ? "image" : "document",
      name: file.name,
      contentType: uploaded.contentType,
      file,
      url: uploaded.url,
      sha256: uploaded.sha256,
      status: { type: "requires-action", reason: "composer-send" }
    } satisfies UploadedPendingAttachment;
  },

  async send(attachment): Promise<CompleteAttachment> {
    const pending = attachment as UploadedPendingAttachment;
    const content = pending.type === "image"
      ? [{ type: "image" as const, image: pending.url }]
      : [{
          type: "file" as const,
          filename: pending.name,
          mimeType: pending.contentType ?? "application/octet-stream",
          data: pending.url
        }];
    return { ...pending, status: { type: "complete" }, content };
  },

  async remove(attachment: Attachment) {
    const key = (attachment as Partial<UploadedPendingAttachment>).key ?? attachment.id;
    const response = await fetch(`/api/files/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`remove_failed_${response.status}`);
  }
};
