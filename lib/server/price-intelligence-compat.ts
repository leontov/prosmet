import "server-only";

import type { ServerSqlClient } from "./postgres";
import {
  deletePriceIntelligence as deletePriceIntelligenceCore,
  ensurePriceIntelligenceSchema as ensurePriceIntelligenceSchemaCore,
  materializePriceIntelligence as materializePriceIntelligenceCore,
  priceIntelligenceEntityKind
} from "./price-intelligence";

const PRICE_INTELLIGENCE_COMPAT_SQL = `
  ALTER TABLE prosmet_canonical_works
    ADD COLUMN IF NOT EXISTS normalized_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS canonical_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS default_unit TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE prosmet_canonical_works
    ALTER COLUMN normalized_name SET DEFAULT '',
    ALTER COLUMN unit SET DEFAULT '',
    ALTER COLUMN canonical_name SET DEFAULT '',
    ALTER COLUMN default_unit SET DEFAULT '';

  ALTER TABLE prosmet_price_observations
    ADD COLUMN IF NOT EXISTS raw_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_id TEXT,
    ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS user_id TEXT,
    ADD COLUMN IF NOT EXISTS organization_id TEXT,
    ADD COLUMN IF NOT EXISTS estimate_item_id TEXT,
    ADD COLUMN IF NOT EXISTS suggested_observation_id TEXT,
    ADD COLUMN IF NOT EXISTS previous_price NUMERIC(18,4),
    ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
    ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'suggested',
    ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS evidence_url TEXT,
    ADD COLUMN IF NOT EXISTS evidence_date TEXT,
    ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS item_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'suggested',
    ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS market_eligible BOOLEAN NOT NULL DEFAULT FALSE;

  ALTER TABLE prosmet_price_observations
    ALTER COLUMN raw_name SET DEFAULT '',
    ALTER COLUMN context_hash SET DEFAULT 'ctx_unknown',
    ALTER COLUMN status SET DEFAULT 'suggested',
    ALTER COLUMN changed_by SET DEFAULT 'system',
    ALTER COLUMN item_id SET DEFAULT '',
    ALTER COLUMN stage SET DEFAULT 'suggested';

  ALTER TABLE prosmet_estimate_item_price_history
    ADD COLUMN IF NOT EXISTS estimate_revision INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS estimate_item_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS accepted_price NUMERIC(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS suggested_observation_id TEXT,
    ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'edited',
    ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS item_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS observation_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS previous_observation_id TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS price NUMERIC(20,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'edited';

  ALTER TABLE prosmet_estimate_item_price_history
    ALTER COLUMN estimate_revision SET DEFAULT 1,
    ALTER COLUMN estimate_item_id SET DEFAULT '',
    ALTER COLUMN canonical_work_id SET DEFAULT 'unknown',
    ALTER COLUMN accepted_price SET DEFAULT 0,
    ALTER COLUMN changed_by SET DEFAULT 'system',
    ALTER COLUMN status SET DEFAULT 'edited',
    ALTER COLUMN changed_at SET DEFAULT NOW(),
    ALTER COLUMN item_id SET DEFAULT '',
    ALTER COLUMN observation_id SET DEFAULT '',
    ALTER COLUMN price SET DEFAULT 0,
    ALTER COLUMN stage SET DEFAULT 'edited';

  ALTER TABLE prosmet_market_price_buckets
    ADD COLUMN IF NOT EXISTS time_bucket TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
    ADD COLUMN IF NOT EXISTS trimmed_mean NUMERIC(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unique_users INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unique_organizations INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS independent_actors INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

  ALTER TABLE prosmet_market_price_buckets
    ALTER COLUMN time_bucket SET DEFAULT '',
    ALTER COLUMN context_hash SET DEFAULT 'ctx_unknown',
    ALTER COLUMN trimmed_mean SET DEFAULT 0;

  ALTER TABLE prosmet_price_research_evidence
    ADD COLUMN IF NOT EXISTS raw_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS observed_price NUMERIC(18,4),
    ADD COLUMN IF NOT EXISTS range_low NUMERIC(18,4),
    ADD COLUMN IF NOT EXISTS range_high NUMERIC(18,4),
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB',
    ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS raw_evidence TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;
`;

export { priceIntelligenceEntityKind };

export async function ensurePriceIntelligenceSchema(client: ServerSqlClient) {
  await ensurePriceIntelligenceSchemaCore(client);
  await client.query(PRICE_INTELLIGENCE_COMPAT_SQL);
}

export async function materializePriceIntelligence(
  client: ServerSqlClient,
  tenantId: string,
  entityId: string,
  rawPayload: unknown
) {
  await ensurePriceIntelligenceSchema(client);
  return materializePriceIntelligenceCore(client, tenantId, entityId, rawPayload);
}

export async function deletePriceIntelligence(
  client: ServerSqlClient,
  tenantId: string,
  entityId: string
) {
  await ensurePriceIntelligenceSchema(client);
  return deletePriceIntelligenceCore(client, tenantId, entityId);
}
