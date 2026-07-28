export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      ok: true,
      service: "prosmet",
      version: "1.0.0",
      time: new Date().toISOString(),
      capabilities: {
        assistantUi: true,
        agUiStreaming: true,
        sqliteWasm: true,
        indexedDbPersistence: true,
        attachments: true,
        technologyCard: true,
        editableEstimate: true,
        editableDocuments: true,
        pdf: true,
        xlsx: true
      },
      provider: {
        id: process.env.PROSMET_DEFAULT_PROVIDER || "prosmet-rules",
        status: "available"
      }
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
