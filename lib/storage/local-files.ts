import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const DEVICE_COOKIE = "prosmet_device";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_ID_PATTERN = UUID_PATTERN;
const root = process.env.FILE_STORAGE_DIR ?? join(process.cwd(), ".data", "uploads");

const MIME_BY_EXTENSION: Record<string, string> = {
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".heic": "image/heic",
  ".ifc": "application/x-step",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel"
};

const ALLOWED_MIME = new Set([
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
  "application/x-step"
]);

export interface StoredFileMetadata {
  id: string;
  ownerId: string;
  originalName: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

const extensionOf = (name: string): string => {
  const match = /(?:\.[a-z0-9]+)$/i.exec(name.trim());
  return match?.[0].toLowerCase() ?? "";
};

export function normalizeFileType(name: string, claimedType: string): string | null {
  const extension = extensionOf(name);
  const inferred = MIME_BY_EXTENSION[extension];
  if (!inferred) return null;

  const normalizedClaim = claimedType.trim().toLowerCase();
  const candidate = !normalizedClaim || normalizedClaim === "application/octet-stream"
    ? inferred
    : normalizedClaim;
  if (!ALLOWED_MIME.has(candidate)) return null;
  if (candidate !== inferred) return null;
  return candidate;
}

export function isFileId(value: string): boolean {
  return FILE_ID_PATTERN.test(value);
}

const cookieValue = (request: Request, name: string): string | null => {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const segment of cookie.split(";")) {
    const [key, ...rest] = segment.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
};

export function readGuestOwner(request: Request): string | null {
  const value = cookieValue(request, DEVICE_COOKIE);
  return value && UUID_PATTERN.test(value) ? value : null;
}

export function getOrCreateGuestOwner(request: Request): { ownerId: string; setCookie: string | null } {
  const existing = readGuestOwner(request);
  if (existing) return { ownerId: existing, setCookie: null };
  const ownerId = randomUUID();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return {
    ownerId,
    setCookie: `${DEVICE_COOKIE}=${encodeURIComponent(ownerId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`
  };
}

const ownerDirectory = (ownerId: string) => {
  if (!UUID_PATTERN.test(ownerId)) throw new Error("invalid_owner_id");
  return join(root, ownerId);
};

const dataPath = (ownerId: string, id: string) => {
  if (!FILE_ID_PATTERN.test(id)) throw new Error("invalid_file_id");
  return join(ownerDirectory(ownerId), `${id}.bin`);
};

const metadataPath = (ownerId: string, id: string) => {
  if (!FILE_ID_PATTERN.test(id)) throw new Error("invalid_file_id");
  return join(ownerDirectory(ownerId), `${id}.json`);
};

export async function storeFile(input: {
  ownerId: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
}): Promise<StoredFileMetadata> {
  if (input.bytes.byteLength <= 0 || input.bytes.byteLength > MAX_FILE_BYTES) throw new Error("invalid_file_size");
  const id = randomUUID();
  const directory = ownerDirectory(input.ownerId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const metadata: StoredFileMetadata = {
    id,
    ownerId: input.ownerId,
    originalName: input.name.slice(0, 240),
    contentType: input.contentType,
    size: input.bytes.byteLength,
    sha256,
    createdAt: new Date().toISOString()
  };
  await Promise.all([
    writeFile(dataPath(input.ownerId, id), input.bytes, { mode: 0o600, flag: "wx" }),
    writeFile(metadataPath(input.ownerId, id), JSON.stringify(metadata), { encoding: "utf8", mode: 0o600, flag: "wx" })
  ]);
  return metadata;
}

export async function loadFile(ownerId: string, id: string): Promise<{ metadata: StoredFileMetadata; bytes: Uint8Array } | null> {
  try {
    const [rawMetadata, bytes] = await Promise.all([
      readFile(metadataPath(ownerId, id), "utf8"),
      readFile(dataPath(ownerId, id))
    ]);
    const metadata = JSON.parse(rawMetadata) as StoredFileMetadata;
    if (metadata.ownerId !== ownerId || metadata.id !== id) return null;
    return { metadata, bytes };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function deleteFile(ownerId: string, id: string): Promise<boolean> {
  const existing = await loadFile(ownerId, id);
  if (!existing) return false;
  await Promise.allSettled([
    unlink(dataPath(ownerId, id)),
    unlink(metadataPath(ownerId, id))
  ]);
  return true;
}
