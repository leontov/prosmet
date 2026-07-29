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
      version: "2.4.0",
      releaseCandidate: "selected-provider-executor",
      releaseSha: process.env.PROSMET_RELEASE_SHA || "development",
      time: new Date().toISOString(),
      frontend: {
        framework: "Next.js",
        assistantUi: true,
        codexDesktopShell: true,
        leftSidebar: true,
        rightInspector: true,
        estimateEditor: "document-v2",
        mobileEstimateEditor: true
      },
      backend: {
        runtime: "Next.js Node server",
        agentEndpoint: "/api/agent",
        syncEndpoint: "/api/sync",
        statusEndpoint: "/api/backend/status",
        agUiStreaming: true,
        providerRouting: "tenant-selected",
        hiddenFallback: false
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
        mobileEstimateEditing: true,
        immutableEstimateRevisions: true,
        priceIntelligence: true,
        immutablePriceHistory: true,
        regionalMarketBuckets: true,
        crossDevicePriceIntelligence: true,
        selectedProviderExecution: true,
        mimoAdapter: true,
        openAiCompatibleAdapter: true,
        ollamaAdapter: true,
        codexCliAdapter: true,
        providerCancellation: true,
        encryptedProviderSecrets: true,
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
