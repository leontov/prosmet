import { ZodError } from "@/lib/zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import { loadWorkspace, saveWorkspace } from "@/lib/server/services/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseHeaders(identity: ReturnType<typeof resolveServerIdentity>) {
  const headers = new Headers({
    "Cache-Control": "no-store, no-cache, must-revalidate"
  });
  if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);
  return headers;
}

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    const workspace = await loadWorkspace(identity.ownerId);
    return Response.json(
      { ok: true, workspace },
      { headers: responseHeaders(identity) }
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: "workspace_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить рабочее пространство."
      },
      { status: 503, headers: responseHeaders(identity) }
    );
  }
}

export async function PUT(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    const body = await request.json();
    const workspace = await saveWorkspace(identity.ownerId, body);
    return Response.json(
      { ok: true, workspace },
      { headers: responseHeaders(identity) }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          ok: false,
          error: "invalid_workspace",
          message: "Проверьте данные профиля и сметные настройки.",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        { status: 400, headers: responseHeaders(identity) }
      );
    }
    return Response.json(
      {
        ok: false,
        error: "workspace_save_failed",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить рабочее пространство."
      },
      { status: 503, headers: responseHeaders(identity) }
    );
  }
}
