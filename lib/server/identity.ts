import "server-only";

import { randomUUID } from "node:crypto";

const COOKIE_NAME = "prosmet_owner";

function parseCookies(header: string | null) {
  const values = new Map<string, string>();
  for (const chunk of (header ?? "").split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (!name) continue;
    values.set(name, decodeURIComponent(rest.join("=")));
  }
  return values;
}

export function resolveServerIdentity(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const existing = cookies.get(COOKIE_NAME)?.trim();
  const ownerId = existing && /^[a-zA-Z0-9:_-]{8,160}$/.test(existing) ? existing : `guest:${randomUUID()}`;
  return {
    ownerId,
    isGuest: ownerId.startsWith("guest:"),
    setCookie:
      existing === ownerId
        ? null
        : `${COOKIE_NAME}=${encodeURIComponent(ownerId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`
  };
}
