import { resolveServerIdentity } from "@/lib/server/identity";
import { listRoles } from "@/lib/server/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);
  return Response.json({ ok: true, ownerId: identity.ownerId, guest: identity.isGuest, roles: await listRoles(identity.ownerId) }, { headers });
}
