import { ZodError } from "zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";
import { loadClientManifest, saveClientManifest } from "@/lib/server/services/client-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers(identity: ReturnType<typeof resolveServerIdentity>) {
  const value = new Headers({ "Cache-Control": "no-store" });
  if (identity.setCookie) value.append("Set-Cookie", identity.setCookie);
  return value;
}

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    return Response.json({ ok: true, manifest: await loadClientManifest(identity.ownerId) }, { headers: headers(identity) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "Manifest unavailable" }, { status: 503, headers: headers(identity) });
  }
}

export async function PUT(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    await assertSuperAdmin(identity.ownerId);
    return Response.json({ ok: true, manifest: await saveClientManifest(identity.ownerId, await request.json()) }, { headers: headers(identity) });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : error instanceof ZodError ? 400 : 503;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "Manifest save failed" }, { status, headers: headers(identity) });
  }
}
