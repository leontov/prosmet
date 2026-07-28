import { z } from "zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import {
  ensureServerSchema,
  getPostgresPool,
  postgresConfigured,
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

async function materialize(
  client: import("pg").PoolClient,
  tenantId: string,
  input: SyncOperation
) {
  const payload = record(input.payload);
  if (input.operation === "delete") {
    const table =
      input.entityType === "thread"
        ? "prosmet_threads"
        : input.entityType === "message"
          ? "prosmet_messages"
          : input.entityType === "estimate"
            ? "prosmet_estimates"
            : input.entityType === "document"
              ? "prosmet_documents"
              : null;
    if (table) {
      await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        input.entityId
      ]);
    }
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
        typeof payload.status === "string" ? payload.status : "active",
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
        Number(payload.revision) || 1,
        typeof payload.status === "string" ? payload.status : "draft",
        JSON.stringify(input.payload ?? {})
      ]
    );
    return;
  }

  if (input.entityType === "document") {
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
        Number(payload.revision) || 1,
        typeof payload.status === "string" ? payload.status : "draft",
        JSON.stringify(input.payload ?? {})
      ]
    );
  }
}

export async function POST(request: Request) {
  if (!postgresConfigured()) {
    return Response.json(
      { error: "server_database_not_configured" },
      { status: 503 }
    );
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

      let accepted = 0;
      let lastCursor = 0;
      for (const operation of input.operations) {
        const inserted = await client.query<{ cursor: string }>(
          `INSERT INTO prosmet_sync_operations
            (operation_id, tenant_id, device_id, entity_type, entity_id,
             operation, payload_json, client_created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamptz)
           ON CONFLICT (tenant_id, operation_id) DO NOTHING
           RETURNING cursor::text`,
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
        if (!inserted.rowCount) continue;
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
    return Response.json(
      { error: "server_database_not_configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit")) || 200));
  const identity = resolveServerIdentity(request);

  try {
    await ensureServerSchema();
    const rows = await getPostgresPool().query<{
      cursor: string;
      operationId: string;
      deviceId: string;
      entityType: string;
      entityId: string;
      operation: "upsert" | "delete";
      payload: unknown;
      createdAt: Date;
    }>(
      `SELECT cursor::text,
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
      createdAt: row.createdAt.toISOString()
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
