import { checkServerDatabase } from "@/lib/server/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkServerDatabase();
  const ok = Boolean(database.connected);
  return Response.json(
    {
      ok,
      service: "prosmet-backend",
      runtime: "next-node",
      agent: {
        endpoint: "/api/agent",
        protocol: "AG-UI SSE",
        provider: process.env.PROSMET_DEFAULT_PROVIDER || "rules",
        streaming: true
      },
      database,
      localFirst: {
        browserCache: "IndexedDB",
        serverAuthority: "PostgreSQL",
        syncEndpoint: "/api/sync",
        wasm: false
      },
      time: new Date().toISOString()
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
