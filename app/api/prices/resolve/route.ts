import { z } from "zod";
import { PriceContextSchema } from "@/lib/domain/price-intelligence";
import { resolveServerIdentity } from "@/lib/server/identity";
import { resolveServerPrice } from "@/lib/server/services/price-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ResolvePriceSchema = z.object({
  canonicalWorkId: z.string().trim().min(1).max(240),
  unit: z.string().trim().min(1).max(40),
  region: z.string().trim().max(240).default(""),
  currency: z.string().trim().min(3).max(8).default("RUB"),
  context: PriceContextSchema.partial().optional()
});

function headers(identity: ReturnType<typeof resolveServerIdentity>) {
  const value = new Headers({
    "Cache-Control": "no-store, no-cache, must-revalidate"
  });
  if (identity.setCookie) value.append("Set-Cookie", identity.setCookie);
  return value;
}

export async function POST(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    const input = ResolvePriceSchema.parse(await request.json());
    const resolution = await resolveServerPrice({
      tenantId: identity.ownerId,
      canonicalWorkId: input.canonicalWorkId,
      unit: input.unit,
      region: input.region,
      currency: input.currency,
      context: input.context
    });
    return Response.json(
      {
        ok: true,
        tenantScoped: true,
        resolution
      },
      { headers: headers(identity) }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        {
          ok: false,
          error: "invalid_price_resolution_request",
          message: "Проверьте вид работы, единицу, регион и контекст цены.",
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
        error: "price_resolution_failed",
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить цены из серверной базы."
      },
      { status: 503, headers: headers(identity) }
    );
  }
}
