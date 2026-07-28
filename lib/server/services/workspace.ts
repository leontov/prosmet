import "server-only";

import { z } from "zod";
import {
  ensureTenant,
  getServerDatabase,
  postgresConfigured,
  withServerTransaction,
  writeAuditEvent
} from "@/lib/server/postgres";

export const LegalFormSchema = z.enum([
  "organization",
  "ip",
  "self-employed",
  "specialist"
]);

export const EstimateMethodSchema = z.enum([
  "commercial",
  "resource",
  "resource-index",
  "base-index",
  "mixed"
]);

export const WorkspaceProfileSchema = z.object({
  displayName: z.string().trim().max(160).default(""),
  legalForm: LegalFormSchema.default("organization"),
  organizationName: z.string().trim().max(240).default(""),
  region: z.string().trim().max(240).default("")
});

export const WorkspaceSettingsSchema = z.object({
  region: z.string().trim().max(240).default(""),
  method: EstimateMethodSchema.default("commercial"),
  currency: z.enum(["RUB", "EUR", "USD"]).default("RUB"),
  vatPercent: z.coerce.number().min(0).max(100).default(0),
  autoSync: z.boolean().default(true)
});

export const WorkspaceUpdateSchema = z.object({
  profile: WorkspaceProfileSchema.optional(),
  settings: WorkspaceSettingsSchema.optional()
});

export type WorkspaceProfile = z.infer<typeof WorkspaceProfileSchema>;
export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;
export type WorkspaceUpdate = z.infer<typeof WorkspaceUpdateSchema>;

export type WorkspaceSnapshot = {
  tenantId: string;
  guest: boolean;
  profile: WorkspaceProfile;
  settings: WorkspaceSettings;
  storage: "postgres" | "unavailable";
  updatedAt: string | null;
};

const defaultProfile: WorkspaceProfile = WorkspaceProfileSchema.parse({});
const defaultSettings: WorkspaceSettings = WorkspaceSettingsSchema.parse({});

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function loadWorkspace(tenantId: string): Promise<WorkspaceSnapshot> {
  if (!postgresConfigured()) {
    return {
      tenantId,
      guest: tenantId.startsWith("guest:"),
      profile: defaultProfile,
      settings: defaultSettings,
      storage: "unavailable",
      updatedAt: null
    };
  }

  await ensureTenant(tenantId);
  const database = await getServerDatabase();
  const [profileResult, settingsResult] = await Promise.all([
    database.query<{
      display_name: string;
      legal_form: string;
      organization_name: string;
      region: string;
      updated_at: Date | string;
    }>(
      `SELECT display_name, legal_form, organization_name, region, updated_at
       FROM prosmet_workspace_profiles
       WHERE tenant_id = $1`,
      [tenantId]
    ),
    database.query<{
      region: string;
      method: string;
      currency: string;
      vat_percent: string | number;
      auto_sync: boolean;
      updated_at: Date | string;
    }>(
      `SELECT region, method, currency, vat_percent, auto_sync, updated_at
       FROM prosmet_workspace_settings
       WHERE tenant_id = $1`,
      [tenantId]
    )
  ]);

  const profileRow = profileResult.rows[0];
  const settingsRow = settingsResult.rows[0];
  const profile = WorkspaceProfileSchema.parse(
    profileRow
      ? {
          displayName: profileRow.display_name,
          legalForm: profileRow.legal_form,
          organizationName: profileRow.organization_name,
          region: profileRow.region
        }
      : defaultProfile
  );
  const settings = WorkspaceSettingsSchema.parse(
    settingsRow
      ? {
          region: settingsRow.region,
          method: settingsRow.method,
          currency: settingsRow.currency,
          vatPercent: asNumber(settingsRow.vat_percent),
          autoSync: settingsRow.auto_sync
        }
      : defaultSettings
  );
  const updatedAt = [profileRow?.updated_at, settingsRow?.updated_at]
    .filter(Boolean)
    .map((value) => new Date(value as Date | string).toISOString())
    .sort()
    .at(-1) ?? null;

  return {
    tenantId,
    guest: tenantId.startsWith("guest:"),
    profile,
    settings,
    storage: "postgres",
    updatedAt
  };
}

export async function saveWorkspace(
  tenantId: string,
  rawInput: unknown
): Promise<WorkspaceSnapshot> {
  if (!postgresConfigured()) {
    throw new Error("PostgreSQL workspace storage is not configured");
  }
  const input = WorkspaceUpdateSchema.parse(rawInput);
  if (!input.profile && !input.settings) {
    throw new Error("Workspace update is empty");
  }

  await ensureTenant(tenantId);
  await withServerTransaction(async (database) => {
    if (input.profile) {
      await database.query(
        `INSERT INTO prosmet_workspace_profiles
          (tenant_id, display_name, legal_form, organization_name, region, profile_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           legal_form = EXCLUDED.legal_form,
           organization_name = EXCLUDED.organization_name,
           region = EXCLUDED.region,
           profile_json = EXCLUDED.profile_json,
           updated_at = NOW()`,
        [
          tenantId,
          input.profile.displayName,
          input.profile.legalForm,
          input.profile.organizationName,
          input.profile.region,
          JSON.stringify(input.profile)
        ]
      );
    }

    if (input.settings) {
      await database.query(
        `INSERT INTO prosmet_workspace_settings
          (tenant_id, region, method, currency, vat_percent, auto_sync, settings_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
         ON CONFLICT (tenant_id) DO UPDATE SET
           region = EXCLUDED.region,
           method = EXCLUDED.method,
           currency = EXCLUDED.currency,
           vat_percent = EXCLUDED.vat_percent,
           auto_sync = EXCLUDED.auto_sync,
           settings_json = EXCLUDED.settings_json,
           updated_at = NOW()`,
        [
          tenantId,
          input.settings.region,
          input.settings.method,
          input.settings.currency,
          input.settings.vatPercent,
          input.settings.autoSync,
          JSON.stringify(input.settings)
        ]
      );
    }
  });

  await writeAuditEvent({
    tenantId,
    action: "workspace.updated",
    entityType: "workspace",
    entityId: tenantId,
    details: {
      profileUpdated: Boolean(input.profile),
      settingsUpdated: Boolean(input.settings)
    }
  });

  return loadWorkspace(tenantId);
}
