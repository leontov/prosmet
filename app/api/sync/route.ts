import { z } from "zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import {
  deletePriceIntelligence,
  ensurePriceIntelligenceSchema,
  materializePriceIntelligence
} from "@/lib/server/price-intelligence";
import {
  ensureServerSchema,
  getServerDatabase,
  postgresConfigured,
  type ServerSqlClient,
  withServerTransaction
} from "@/lib/server/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const operationSchema = z.object({
  id: z.string().min(1).max(200),
  entityType: z.enum(["thread", "message", "estimate", "document", "file", "price"]),
  entityId: z.string().min(1).max(240),
  operation: z.enum(["upsert", "delete"]),
  payload: z.unknown().nullable().optional(),
  createdAt: z.string().datetime().optional()
});

const pushSchema = z.object({
  deviceId: z.string().min(1).max(200),
  operations: z.array(operationSchema).max(250)
});

type SyncOperation = z.infer<typeof operationSchema>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function deleteMaterialized(
  client: ServerSqlClient,
  tenantId: string,
  input: SyncOperation
) {
  if (input.entityType === "thread") {
    await client.query(
      `DELETE FROM prosmet_messages WHERE tenant_id = $1 AND thread_id = $2`,
      [tenantId, input.entityId]
    );
    await client.query(
      `UPDATE prosmet_estimates SET thread_id = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND thread_id = $2`,
      [tenantId, input.entityId]
    );
    await client.query(
      `UPDATE prosmet_documents SET thread_id = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND thread_id = $2`,
      [tenantId, input.entityId]
    );
    await client.query(
      `UPDATE prosmet_files SET thread_id = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND thread_id = $2`,
      [tenantId, input.entityId]
    );
    await client.query(
      `DELETE FROM prosmet_threads WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.entityId]
    );
    return;
  }

  if (input.entityType === "price") {
    await deletePriceIntelligence(client, tenantId, input.entityId);
  }

  const table =
    input.entityType === "message"
      ? "prosmet_messages"
      : input.entityType === "estimate"
        ? "prosmet_estimates"
        : input.entityType === "document"
          ? "prosmet_documents"
          : input.entityType === "price"
            ? "prosmet_prices"
            : input.entityType === "file"
              ? "prosmet_files"
              : null;
  if (!table) return;
  await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    input.entityId
  ]);
}

async function preserveEstimateRevision(
  client: ServerSqlClient,
  tenantId: string,
  estimateId: string,
  nextRevision: number
) {
  const existing = await client.query<{
    revision: number;
    payload: unknown;
  }>(
    `SELECT revision, payload_json AS payload
       FROM prosmet_estimates
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, estimateId]
  );
  const previous = existing.rows[0];
  if (!previous || Number(previous.revision) === nextRevision) return;
  await client.query(
    `INSERT INTO prosmet_estimate_revisions
      (tenant_id, estimate_id, revision, payload_json, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (tenant_id, estimate_id, revision) DO NOTHING`,
    [tenantId, estimateId, Number(previous.revision), JSON.stringify(previous.payload)]
  );
}

async function preserveDocumentRevision(
  client: ServerSqlClient,
  tenantId: string,
  documentId: string,
  nextRevision: number
) {
  const existing = await client.query<{
    revision: number;
    payload: unknown;
  }>(
    `SELECT revision, payload_json AS payload
       FROM prosmet_documents
      WHERE tenant_id = $1 AND id = $2`,
    [tenantId, documentId]
  );
  const previous = existing.rows[0];
  if (!previous || Number(previous.revision) === nextRevision) return;
  await client.query(
    `INSERT INTO prosmet_document_revisions
      (tenant_id, document_id, revision, payload_json, created_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (tenant_id, document_id, revision) DO NOTHING`,
    [tenantId, documentId, Number(previous.revision), JSON.stringify(previous.payload)]
  );
}

async function materialize(
  client: ServerSqlClient,
  tenantId: string,
  input: SyncOperation
) {
  const payload = record(input.payload);
  if (input.operation === "delete") {
    await deleteMaterialized(client, tenantId, input);
    return;
  }

  if (input.entityType === "thread") {
    await client.query(
      `INSERT INTO prosmet_threads
        (tenant_id, id, title, object_name, status, pinned, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         title = EXCLUDED.title,
         object_name = EXCLUDED.object_name,
         status = EXCLUDED.status,
         pinned = EXCLUDED.pinned,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        input.entityId,
        typeof payload.title === "string" ? payload.title : null,
        typeof payload.objectName === "string" ? payload.objectName : "",
        payload.status === "archived" ? "archived" : "active",
        Boolean(payload.pinned),
        JSON.stringify(input.payload ?? {})
      ]
    );
    return;
  }

  if (input.entityType === "message") {
    await client.query(
      `INSERT INTO prosmet_messages
        (tenant_id, thread_id, id, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         thread_id = EXCLUDED.thread_id,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        typeof payload.threadId === "string" ? payload.threadId : "",
        input.entityId,
        JSON.stringify(input.payload ?? {})
      ]
    );
    return;
  }

  if (input.entityType === "estimate") {
    const revision = Math.max(1, Number(payload.revision) || 1);
    await preserveEstimateRevision(client, tenantId, input.entityId, revision);
    await client.query(
      `INSERT INTO prosmet_estimates
        (tenant_id, id, thread_id, revision, status, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         thread_id = COALESCE(EXCLUDED.thread_id, prosmet_estimates.thread_id),
         revision = EXCLUDED.revision,
         status = EXCLUDED.status,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        input.entityId,
        typeof payload.threadId === "string" ? payload.threadId : null,
        revision,
        typeof payload.status === "string" ? payload.status : "draft",
        JSON.stringify(input.payload ?? {})
      ]
    );
    return;
  }

  if (input.entityType === "document") {
    const revision = Math.max(1, Number(payload.revision) || 1);
    await preserveDocumentRevision(client, tenantId, input.entityId, revision);
    await client.query(
      `INSERT INTO prosmet_documents
        (tenant_id, id, thread_id, revision, status, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         thread_id = COALESCE(EXCLUDED.thread_id, prosmet_documents.thread_id),
         revision = EXCLUDED.revision,
         status = EXCLUDED.status,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        input.entityId,
        typeof payload.threadId === "string" ? payload.threadId : null,
        revision,
        typeof payload.status === "string" ? payload.status : "draft",
        JSON.stringify(input.payload ?? {})
      ]
    );
    return;
  }

  if (input.entityType === "price") {
    await client.query(
      `INSERT INTO prosmet_prices
        (tenant_id, id, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [tenantId, input.entityId, JSON.stringify(input.payload ?? {})]
    );
    await materializePriceIntelligence(client, tenantId, input.entityId, input.payload);
    return;
  }

  if (input.entityType === "file") {
    await client.query(
      `INSERT INTO prosmet_files
        (tenant_id, id, thread_id, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         thread_id = COALESCE(EXCLUDED.thread_id, prosmet_files.thread_id),
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        input.entityId,
        typeof payload.threadId === "string" ? payload.threadId : null,
        JSON.stringify(input.payload ?? {})
      ]
    );
  }
}

export async function POST(request: Request) {
  if (!postgresConfigured()) {
    return Response.json({ error: "server_database_not_configured" }, { status: 503 });
  }

  let input: z.infer<typeof pushSchema>;
  try {
    input = pushSchema.parse(await request.json());
  } catch (error) {
    return Response.json(
      {
        error: "invalid_sync_payload",
        message: error instanceof Error ? error.message : "Invalid sync payload"
      },
      { status: 422 }
    );
  }

  const identity = resolveServerIdentity(request);
  try {
    const result = await withServerTransaction(async (client) => {
      await client.query(
        `INSERT INTO prosmet_tenants (id) VALUES ($1)
         ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
        [identity.ownerId]
      );
      await ensurePriceIntelligenceSchema(client);

      let accepted = 0;
      let lastCursor = 0;
      for (const operation of input.operations) {
        const inserted = await client.query<{ cursor: string | number }>(
          `INSERT INTO prosmet_sync_operations
            (operation_id, tenant_id, device_id, entity_type, entity_id,
             operation, payload_json, client_created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
           ON CONFLICT (tenant_id, operation_id) DO NOTHING
           RETURNING cursor`,
          [
            operation.id,
            identity.ownerId,
            input.deviceId,
            operation.entityType,
            operation.entityId,
            operation.operation,
            JSON.stringify(operation.payload ?? null),
            operation.createdAt ?? null
          ]
        );
        if (!inserted.rows.length) continue;
        await materialize(client, identity.ownerId, operation);
        accepted += 1;
        lastCursor = Math.max(lastCursor, Number(inserted.rows[0]?.cursor ?? 0));
      }
      return { accepted, cursor: lastCursor };
    });

    const headers = new Headers({ "Cache-Control": "no-store" });
    if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);
    return Response.json(result, { headers });
  } catch (error) {
    return Response.json(
      {
        error: "sync_push_failed",
        message: error instanceof Error ? error.message : "Sync push failed"
      },
      { status: 503 }
    );
  }
}

export async function GET(request: Request) {
  if (!postgresConfigured()) {
    return Response.json({ error: "server_database_not_configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const identity = resolveServerIdentity(request);

  try {
    await ensureServerSchema();
    const rows = await (await getServerDatabase()).query<{
      cursor: string | number;
      operationId: string;
      deviceId: string;
      entityType: string;
      entityId: string;
      operation: "upsert" | "delete";
      payload: unknown;
      createdAt: Date | string;
    }>(
      `SELECT cursor,
              operation_id AS "operationId",
              device_id AS "deviceId",
              entity_type AS "entityType",
              entity_id AS "entityId",
              operation,
              payload_json AS payload,
              created_at AS "createdAt"
         FROM prosmet_sync_operations
        WHERE tenant_id = $1 AND cursor > $2
        ORDER BY cursor ASC
        LIMIT $3`,
      [identity.ownerId, cursor, limit]
    );

    const operations = rows.rows.map((row) => ({
      ...row,
      cursor: Number(row.cursor),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString()
    }));
    const nextCursor = operations.at(-1)?.cursor ?? cursor;
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);
    return Response.json({ cursor: nextCursor, operations }, { headers });
  } catch (error) {
    return Response.json(
      {
        error: "sync_pull_failed",
        message: error instanceof Error ? error.message : "Sync pull failed"
      },
      { status: 503 }
    );
  }
}
