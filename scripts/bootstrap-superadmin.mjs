import { randomUUID } from "node:crypto";
import pg from "pg";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : "";
}

const ownerId = argument("owner");
const email = argument("email");
const tenantId = argument("tenant") || ownerId;
if (!ownerId || !/^[a-zA-Z0-9:_-]{8,160}$/.test(ownerId)) {
  throw new Error("Pass --owner from GET /api/identity (for example guest:uuid).");
}
if (!email || !email.includes("@")) throw new Error("Pass --email for the super-admin audit record.");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString?.startsWith("postgresql://")) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString, application_name: "prosmet-superadmin-bootstrap" });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`INSERT INTO prosmet_tenants (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [tenantId]);
  await client.query(
    `INSERT INTO prosmet_memberships (id, tenant_id, owner_id, email, role, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'super_admin', TRUE, NOW(), NOW())
     ON CONFLICT (tenant_id, owner_id, role) DO UPDATE SET email = EXCLUDED.email, active = TRUE, updated_at = NOW()`,
    [`membership_${randomUUID()}`, tenantId, ownerId, email]
  );
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, tenantId, ownerId, email, role: "super_admin" }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
