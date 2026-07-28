export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "prosmet",
    transport: "ag-ui",
    version: process.env.GITHUB_SHA ?? "development",
    timestamp: new Date().toISOString()
  });
}
