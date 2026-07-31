import { z, ZodError } from "@/lib/zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";
import {
  deleteProviderConnection,
  listProviderConnections,
  providerErrorCode,
  saveProviderConnection,
  selectProviderConnection
} from "@/lib/server/services/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deployment provisions this value outside the repository. Keep the provider
// service compatible with its internal name without ever returning the key.
process.env.PROSMET_MASTER_KEY ??= process.env.PROSMET_PROVIDER_MASTER_KEY;

const IdentifierSchema = z.object({
  id: z.string().trim().regex(/^[a-zA-Z0-9:_-]{4,160}$/)
});

function headers(identity: ReturnType<typeof resolveServerIdentity>) {
  const value = new Headers({
    "Cache-Control": "no-store, no-cache, must-revalidate"
  });
  if (identity.setCookie) value.append("Set-Cookie", identity.setCookie);
  return value;
}

function failure(
  identity: ReturnType<typeof resolveServerIdentity>,
  error: unknown,
  fallback: string,
  status = 400
) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: "invalid_provider_connection",
        message: "Проверьте настройки AI-провайдера.",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      },
      { status: 400, headers: headers(identity) }
    );
  }
  return Response.json(
    {
      ok: false,
      error: providerErrorCode(error),
      message: error instanceof Error ? error.message : fallback
    },
    { status: error instanceof AuthorizationError ? 403 : status, headers: headers(identity) }
  );
}

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    const providers = await listProviderConnections(identity.ownerId);
    return Response.json(
      { ok: true, providers },
      { headers: headers(identity) }
    );
  } catch (error) {
    return failure(
      identity,
      error,
      "Не удалось загрузить AI-провайдеры.",
      503
    );
  }
}

export async function POST(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    await assertSuperAdmin(identity.ownerId);
    const connection = await saveProviderConnection(
      identity.ownerId,
      await request.json()
    );
    return Response.json(
      { ok: true, connection },
      { status: 201, headers: headers(identity) }
    );
  } catch (error) {
    return failure(
      identity,
      error,
      "Не удалось проверить или сохранить AI-провайдера."
    );
  }
}

export async function PATCH(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    await assertSuperAdmin(identity.ownerId);
    const { id } = IdentifierSchema.parse(await request.json());
    const connection = await selectProviderConnection(identity.ownerId, id);
    return Response.json(
      { ok: true, connection },
      { headers: headers(identity) }
    );
  } catch (error) {
    return failure(identity, error, "Не удалось выбрать AI-провайдера.");
  }
}

export async function DELETE(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    await assertSuperAdmin(identity.ownerId);
    const { id } = IdentifierSchema.parse(await request.json());
    const result = await deleteProviderConnection(identity.ownerId, id);
    return Response.json(
      { ok: true, ...result },
      { headers: headers(identity) }
    );
  } catch (error) {
    return failure(identity, error, "Не удалось отключить AI-провайдера.");
  }
}
