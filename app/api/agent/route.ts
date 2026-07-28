import { RunAgentInputSchema } from "@ag-ui/core";
import { runChiefEstimator } from "@/lib/agui/agent-handler";
import { encodeSse, sseResponse } from "@/lib/agui/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const input = RunAgentInputSchema.safeParse(parsed);
  if (!input.success) {
    return Response.json({ error: "invalid_agui_input", details: input.error.flatten() }, { status: 422 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runChiefEstimator(input.data, request.signal)) {
          controller.enqueue(encodeSse(event));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // request.signal is propagated into the estimator and stops pending work.
    }
  });

  return sseResponse(stream);
}
