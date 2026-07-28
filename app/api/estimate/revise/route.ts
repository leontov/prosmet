import { reviseEstimateRequestSchema } from "@/lib/domain/schemas";
import { recalculateEstimate } from "@/lib/domain/estimate-engine";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reviseEstimateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_estimate", details: parsed.error.flatten() }, { status: 422 });
  }
  if (parsed.data.estimate.revision !== parsed.data.baseRevision) {
    return Response.json({ error: "revision_conflict", currentRevision: parsed.data.estimate.revision }, { status: 409 });
  }
  const estimate = recalculateEstimate(parsed.data.estimate, parsed.data.baseRevision + 1);
  return Response.json({
    estimate,
    stateDelta: [
      { op: "replace", path: "/activeEstimate", value: estimate },
      { op: "replace", path: "/estimateRevision", value: estimate.revision }
    ],
    audit: { action: "estimate.revised", reason: parsed.data.reason, at: estimate.updatedAt }
  });
}
