import { Buffer } from "node:buffer";
import { EstimateDraftSchema } from "@/lib/domain/estimate";
import {
  createEstimatePdfBuffer,
  createEstimateXlsxBuffer,
  estimateExportFilename
} from "@/lib/server/exports/estimate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function POST(request: Request) {
  try {
    const format = new URL(request.url).searchParams.get("format");
    if (format !== "pdf" && format !== "xlsx") {
      return Response.json({ error: "Неизвестный формат экспорта" }, { status: 400 });
    }

    const parsed = EstimateDraftSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Смета не прошла проверку перед экспортом" }, { status: 400 });
    }

    const bytes = format === "pdf"
      ? await createEstimatePdfBuffer(parsed.data)
      : await createEstimateXlsxBuffer(parsed.data);
    const filename = estimateExportFilename(parsed.data, format);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": format === "pdf"
? "application/pdf"
: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": disposition(filename),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Estimate export failed", error);
    return Response.json({ error: "Документ не сформирован" }, { status: 500 });
  }
}
