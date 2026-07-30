import "server-only";

import { ClientManifestSchema, DEFAULT_CLIENT_MANIFEST, type ClientManifest } from "@/lib/domain/client-manifest";
import { ensureTenant, getServerDatabase, postgresConfigured, writeAuditEvent } from "@/lib/server/postgres";

export async function loadClientManifest(tenantId: string): Promise<ClientManifest> {
  if (!postgresConfigured()) return DEFAULT_CLIENT_MANIFEST;
  await ensureTenant(tenantId);
  const result = await (await getServerDatabase()).query<{ manifest_json: unknown; updated_at: Date | string }>(
    `SELECT manifest_json, updated_at FROM prosmet_client_manifests WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!result.rows[0]) return DEFAULT_CLIENT_MANIFEST;
  return ClientManifestSchema.parse({
    ...(result.rows[0].manifest_json as Record<string, unknown>),
    updatedAt: new Date(result.rows[0].updated_at).toISOString()
  });
}

export async function saveClientManifest(tenantId: string, raw: unknown): Promise<ClientManifest> {
  await ensureTenant(tenantId);
  const manifest = ClientManifestSchema.parse({ ...(raw as Record<string, unknown>), updatedAt: new Date().toISOString() });
  await (await getServerDatabase()).query(
    `INSERT INTO prosmet_client_manifests (tenant_id, manifest_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET manifest_json = EXCLUDED.manifest_json, updated_at = NOW()`,
    [tenantId, JSON.stringify(manifest)]
  );
  await writeAuditEvent(tenantId, "client_manifest_updated", { modules: manifest.modules, version: manifest.version });
  return loadClientManifest(tenantId);
}
