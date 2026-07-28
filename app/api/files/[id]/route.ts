import { deleteFile, isFileId, loadFile, readGuestOwner } from "@/lib/storage/local-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encodedName = (name: string) => encodeURIComponent(name.replace(/[\r\n]/g, "_"));

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerId = readGuestOwner(request);
  if (!ownerId) return new Response(null, { status: 404 });
  const { id } = await context.params;
  if (!isFileId(id)) return new Response(null, { status: 404 });
  const stored = await loadFile(ownerId, id);
  if (!stored) return new Response(null, { status: 404 });

  const body = stored.bytes.buffer.slice(
    stored.bytes.byteOffset,
    stored.bytes.byteOffset + stored.bytes.byteLength
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": stored.metadata.contentType,
      "Content-Length": String(stored.metadata.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodedName(stored.metadata.originalName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "X-File-SHA256": stored.metadata.sha256
    }
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const ownerId = readGuestOwner(request);
  if (!ownerId) return new Response(null, { status: 404 });
  const { id } = await context.params;
  if (!isFileId(id)) return new Response(null, { status: 404 });
  const deleted = await deleteFile(ownerId, id);
  return new Response(null, { status: deleted ? 204 : 404 });
}
