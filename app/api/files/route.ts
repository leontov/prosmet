import {
  getOrCreateGuestOwner,
  MAX_FILE_BYTES,
  normalizeFileType,
  storeFile
} from "@/lib/storage/local-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_FILE_BYTES + 1024 * 1024) {
    return Response.json({ error: "file_too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "invalid_multipart" }, { status: 400 });
  }

  const value = form.get("file");
  if (!(value instanceof File)) return Response.json({ error: "file_required" }, { status: 400 });
  if (value.size <= 0 || value.size > MAX_FILE_BYTES) return Response.json({ error: "invalid_file_size" }, { status: 413 });
  const contentType = normalizeFileType(value.name, value.type);
  if (!contentType) return Response.json({ error: "file_type_not_allowed" }, { status: 415 });

  const { ownerId, setCookie } = getOrCreateGuestOwner(request);
  const bytes = new Uint8Array(await value.arrayBuffer());
  const metadata = await storeFile({ ownerId, name: value.name, contentType, bytes });
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (setCookie) headers.set("Set-Cookie", setCookie);

  return Response.json({
    id: metadata.id,
    url: `/api/files/${metadata.id}`,
    name: metadata.originalName,
    contentType: metadata.contentType,
    size: metadata.size,
    sha256: metadata.sha256
  }, { status: 201, headers });
}
