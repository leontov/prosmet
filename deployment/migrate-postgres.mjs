import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString?.startsWith("postgresql://")) {
  throw new Error("DATABASE_URL is missing or is not PostgreSQL");
}

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 60_000,
  application_name: "prosmet-migration"
});

const SQL = `
BEGIN;

CREATE TABLE IF NOT EXISTS prosmet_tenants (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prosmet_canonical_works (
  tenant_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  normalized_name TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  canonical_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  default_unit TEXT NOT NULL DEFAULT '',
  aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_canonical_works
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS normalized_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS canonical_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_canonical_works SET tenant_id = 'legacy' WHERE tenant_id IS NULL OR tenant_id = '';
ALTER TABLE prosmet_canonical_works ALTER COLUMN tenant_id SET DEFAULT 'legacy';
ALTER TABLE prosmet_canonical_works ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_canonical_works_tenant_id
  ON prosmet_canonical_works(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_canonical_work_lookup
  ON prosmet_canonical_works(tenant_id, normalized_name, unit);
CREATE INDEX IF NOT EXISTS idx_prosmet_canonical_works_name
  ON prosmet_canonical_works(tenant_id, canonical_name);

CREATE TABLE IF NOT EXISTS prosmet_price_observations (
  tenant_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  raw_name TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  price NUMERIC(20,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  unit TEXT NOT NULL DEFAULT 'шт',
  region TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'ai_indicative',
  source_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  organization_id TEXT,
  estimate_id TEXT NOT NULL DEFAULT '',
  estimate_revision INTEGER NOT NULL DEFAULT 0,
  item_id TEXT NOT NULL DEFAULT '',
  estimate_item_id TEXT,
  suggested_observation_id TEXT,
  previous_price NUMERIC(20,4),
  context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'suggested',
  stage TEXT NOT NULL DEFAULT 'suggested',
  changed_by TEXT NOT NULL DEFAULT 'system',
  change_reason TEXT NOT NULL DEFAULT '',
  evidence_url TEXT,
  evidence_date TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  market_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_price_observations
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS raw_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'шт',
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'ai_indicative',
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS organization_id TEXT,
  ADD COLUMN IF NOT EXISTS estimate_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_item_id TEXT,
  ADD COLUMN IF NOT EXISTS suggested_observation_id TEXT,
  ADD COLUMN IF NOT EXISTS previous_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_date TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_from TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valid_to TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS market_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_price_observations SET tenant_id = 'legacy' WHERE tenant_id IS NULL OR tenant_id = '';
ALTER TABLE prosmet_price_observations ALTER COLUMN tenant_id SET DEFAULT 'legacy';
ALTER TABLE prosmet_price_observations ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_price_observations_tenant_id
  ON prosmet_price_observations(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_observation_work_region
  ON prosmet_price_observations(tenant_id, canonical_work_id, unit, region, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_observation_estimate_item
  ON prosmet_price_observations(tenant_id, estimate_id, item_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_estimate_item
  ON prosmet_price_observations(tenant_id, estimate_id, estimate_item_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_observation_market
  ON prosmet_price_observations(canonical_work_id, unit, region, observed_at DESC)
  WHERE market_eligible = TRUE;

CREATE TABLE IF NOT EXISTS prosmet_estimate_item_price_history (
  tenant_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  estimate_id TEXT NOT NULL DEFAULT '',
  estimate_revision INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL DEFAULT '',
  estimate_item_id TEXT NOT NULL DEFAULT '',
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  observation_id TEXT NOT NULL DEFAULT '',
  previous_observation_id TEXT NOT NULL DEFAULT '',
  previous_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  accepted_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  price NUMERIC(20,4) NOT NULL DEFAULT 0,
  suggested_observation_id TEXT,
  changed_by TEXT NOT NULL DEFAULT 'system',
  change_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'edited',
  stage TEXT NOT NULL DEFAULT 'edited',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_estimate_item_price_history
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS estimate_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS item_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimate_item_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS observation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_observation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suggested_observation_id TEXT,
  ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS change_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'edited',
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'edited',
  ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_estimate_item_price_history SET tenant_id = 'legacy' WHERE tenant_id IS NULL OR tenant_id = '';
ALTER TABLE prosmet_estimate_item_price_history ALTER COLUMN tenant_id SET DEFAULT 'legacy';
ALTER TABLE prosmet_estimate_item_price_history ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_price_history_tenant_id
  ON prosmet_estimate_item_price_history(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_history_estimate_item
  ON prosmet_estimate_item_price_history(tenant_id, estimate_id, item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_history_estimate_item_v2
  ON prosmet_estimate_item_price_history(tenant_id, estimate_id, estimate_item_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS prosmet_user_price_profiles (
  tenant_id TEXT NOT NULL,
  id TEXT,
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  unit TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'RUB',
  price NUMERIC(20,4) NOT NULL DEFAULT 0,
  observation_id TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'approved',
  confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  preferred_price NUMERIC(20,4),
  last_approved_price NUMERIC(20,4),
  range_low NUMERIC(20,4),
  range_high NUMERIC(20,4),
  sample_count INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_user_price_profiles
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  ADD COLUMN IF NOT EXISTS preferred_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS last_approved_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_low NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_high NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_user_price_profiles
SET id = 'user_' || md5(tenant_id || ':' || canonical_work_id || ':' || region || ':' || context_hash)
WHERE id IS NULL OR id = '';
ALTER TABLE prosmet_user_price_profiles ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_user_price_profiles_tenant_id
  ON prosmet_user_price_profiles(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_user_price_profile_lookup
  ON prosmet_user_price_profiles(tenant_id, canonical_work_id, unit, region, updated_at DESC);

CREATE TABLE IF NOT EXISTS prosmet_organization_price_profiles (
  tenant_id TEXT NOT NULL,
  id TEXT,
  organization_id TEXT NOT NULL DEFAULT '',
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  unit TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'RUB',
  price NUMERIC(20,4) NOT NULL DEFAULT 0,
  observation_id TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'approved',
  confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  preferred_price NUMERIC(20,4),
  last_approved_price NUMERIC(20,4),
  range_low NUMERIC(20,4),
  range_high NUMERIC(20,4),
  sample_count INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_organization_price_profiles
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS price NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observation_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  ADD COLUMN IF NOT EXISTS preferred_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS last_approved_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_low NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_high NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_organization_price_profiles
SET id = 'org_' || md5(tenant_id || ':' || organization_id || ':' || canonical_work_id || ':' || region || ':' || context_hash)
WHERE id IS NULL OR id = '';
ALTER TABLE prosmet_organization_price_profiles ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_organization_price_profiles_tenant_id
  ON prosmet_organization_price_profiles(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_org_price_profile_lookup
  ON prosmet_organization_price_profiles(tenant_id, canonical_work_id, unit, region, updated_at DESC);

CREATE TABLE IF NOT EXISTS prosmet_market_price_buckets (
  tenant_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  unit TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  locality TEXT NOT NULL DEFAULT '',
  time_bucket TEXT NOT NULL DEFAULT '',
  context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  sample_count INTEGER NOT NULL DEFAULT 0,
  independent_actors INTEGER NOT NULL DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  unique_organizations INTEGER NOT NULL DEFAULT 0,
  median NUMERIC(20,4) NOT NULL DEFAULT 0,
  p25 NUMERIC(20,4) NOT NULL DEFAULT 0,
  p75 NUMERIC(20,4) NOT NULL DEFAULT 0,
  trimmed_mean NUMERIC(20,4) NOT NULL DEFAULT 0,
  confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_market_price_buckets
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS time_bucket TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS context_hash TEXT NOT NULL DEFAULT 'ctx_unknown',
  ADD COLUMN IF NOT EXISTS sample_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS independent_actors INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_users INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_organizations INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS median NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p25 NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS p75 NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trimmed_mean NUMERIC(20,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_market_price_buckets SET tenant_id = 'legacy' WHERE tenant_id IS NULL OR tenant_id = '';
ALTER TABLE prosmet_market_price_buckets ALTER COLUMN tenant_id SET DEFAULT 'legacy';
ALTER TABLE prosmet_market_price_buckets ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_market_price_buckets_tenant_id
  ON prosmet_market_price_buckets(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_market_bucket_lookup
  ON prosmet_market_price_buckets(tenant_id, canonical_work_id, unit, region, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_prosmet_market_price_buckets_lookup
  ON prosmet_market_price_buckets(tenant_id, canonical_work_id, region, time_bucket, updated_at DESC);

CREATE TABLE IF NOT EXISTS prosmet_price_research_evidence (
  tenant_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  canonical_work_id TEXT NOT NULL DEFAULT 'unknown',
  raw_name TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  observed_price NUMERIC(20,4),
  range_low NUMERIC(20,4),
  range_high NUMERIC(20,4),
  currency TEXT NOT NULL DEFAULT 'RUB',
  confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_evidence TEXT NOT NULL DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE prosmet_price_research_evidence
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS raw_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_label TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observed_price NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_low NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS range_high NUMERIC(20,4),
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS raw_evidence TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE prosmet_price_research_evidence SET tenant_id = 'legacy' WHERE tenant_id IS NULL OR tenant_id = '';
ALTER TABLE prosmet_price_research_evidence ALTER COLUMN tenant_id SET DEFAULT 'legacy';
ALTER TABLE prosmet_price_research_evidence ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prosmet_price_research_evidence_tenant_id
  ON prosmet_price_research_evidence(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_prosmet_price_research_lookup
  ON prosmet_price_research_evidence(tenant_id, canonical_work_id, unit, region, observed_at DESC);

CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
`;

await client.connect();
try {
  await client.query(SQL);
  const result = await client.query(`
    SELECT
      current_database() AS database,
      current_user AS user,
      to_regclass('public.prosmet_price_observations')::text AS price_observations,
      to_regclass('public.prosmet_estimate_item_price_history')::text AS price_history,
      to_regclass('public.prosmet_market_price_buckets')::text AS market_buckets
  `);
  console.log(JSON.stringify({ migrated: true, ...result.rows[0] }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
