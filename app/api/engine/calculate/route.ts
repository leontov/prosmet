import { ZodError } from "@/lib/zod";
import { EstimateDraftSchema } from "@/lib/domain/estimate";
import { calculateWithRust, rustCalculationAsNumbers } from "@/lib/server/engine/rust-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const draft = EstimateDraftSchema.parse(await request.json());
    const result = await calculateWithRust(draft, { signal: request.signal });
    return Response.json(
      {
        ok: true,
        engine: result.engine,
        engineVersion: result.engineVersion,
        digest: result.digest,
        calculation: rustCalculationAsNumbers(result)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const invalid = error instanceof ZodError;
    return Response.json(
      {
        ok: false,
        error: invalid ? "invalid_estimate" : "rust_engine_unavailable",
        message: error instanceof Error ? error.message : "Расчётный движок недоступен"
      },
      { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
