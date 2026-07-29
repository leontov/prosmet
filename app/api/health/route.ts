import { checkServerDatabase } from "@/lib/server/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = await checkServerDatabase();
  const production = process.env.NODE_ENV === "production";
  const ok = production ? database.connected : true;

  return Response.json(
    {
      ok,
      service: "prosmet",
      version: "2.3.1",
      releaseCandidate: "editor-v2-price-intelligence",
      releaseSha: process.env.PROSMET_RELEASE_SHA || "development",
      time: new Date().toISOString(),
      frontend: {
        framework: "Next.js",
        assistantUi: true,
        codexDesktopShell: true,
        leftSidebar: true,
        rightInspector: true,
        estimateEditor: "document-v2"
      },
      backend: {
        runtime: "Next.js Node server",
        agentEndpoint: "/api/agent",
        syncEndpoint: "/api/sync",
        statusEndpoint: "/api/backend/status",
        agUiStreaming: true,
        provider: process.env.PROSMET_DEFAULT_PROVIDER || "rules"
      },
      database,
      localFirst: {
        browserCache: "IndexedDB",
        browserWasm: false,
        serverAuthority: "PostgreSQL",
        offlineOutbox: true,
        bidirectionalSync: true
      },
      capabilities: {
        attachments: true,
        technologyCard: true,
        editableEstimate: true,
        estimateDocumentEditorV2: true,
        immutableEstimateRevisions: true,
        priceIntelligence: true,
        immutablePriceHistory: true,
        regionalMarketBuckets: true,
        editableDocuments: true,
        pdf: true,
        xlsx: true
      }
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" }
    }
  );
}
