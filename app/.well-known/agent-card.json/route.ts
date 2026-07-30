import { prosmetDeveloperAgentCard } from "@/lib/server/a2a/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return Response.json(prosmetDeveloperAgentCard(origin), {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=300" }
  });
}
