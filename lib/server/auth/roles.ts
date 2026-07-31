import "server-only";

import { getServerDatabase, postgresConfigured } from "@/lib/server/postgres";

export class AuthorizationError extends Error {
  code = "superadmin_required";
  constructor(message = "Требуются права супер-администратора.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function listRoles(ownerId: string) {
  if (!postgresConfigured()) return [] as string[];
  const result = await (await getServerDatabase()).query<{ role: string }>(
    `SELECT role FROM prosmet_memberships WHERE owner_id = $1 AND active = TRUE ORDER BY role`,
    [ownerId]
  );
  return result.rows.map((row) => row.role);
}

export async function assertSuperAdmin(ownerId: string) {
  if (process.env.PROSMET_ADMIN_MODE === "permissive") return;
  const roles = await listRoles(ownerId);
  if (!roles.includes("super_admin")) throw new AuthorizationError();
}
