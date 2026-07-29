import "server-only";

import type { ServerSqlClient } from "@/lib/server/postgres";

const PRICE_INTELLIGENCE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS prosmet_canonical_works (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    default_unit TEXT NOT NULL DEFAULT '',
    aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_canonical_works_name
    ON prosmet_canonical_works(tenant_id, canonical_name);

  CREATE TABLE IF NOT EXISTS prosmet_price_observations (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    raw_name TEXT NOT NULL,
    code TEXT NOT NULL DEFAULT '',
    price NUMERIC(18,4) NOT NULL CHECK (price >= 0),
    currency TEXT NOT NULL DEFAULT 'RUB',
    unit TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_label TEXT NOT NULL DEFAULT '',
    user_id TEXT,
    organization_id TEXT,
    estimate_id TEXT,
    estimate_revision INTEGER,
    estimate_item_id TEXT,
    suggested_observation_id TEXT,
    previous_price NUMERIC(18,4),
    context_hash TEXT NOT NULL,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    changed_by TEXT NOT NULL DEFAULT 'system',
    change_reason TEXT NOT NULL DEFAULT '',
    evidence_url TEXT,
    evidence_date TEXT,
    observed_at TIMESTAMPTZ NOT NULL,
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_work_unit
    ON prosmet_price_observations(tenant_id, canonical_work_id, unit);
  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_work_region
    ON prosmet_price_observations(tenant_id, canonical_work_id, region, observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_estimate_item
    ON prosmet_price_observations(tenant_id, estimate_id, estimate_item_id, observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_status
    ON prosmet_price_observations(tenant_id, status, observed_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_estimate_item_price_history (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    estimate_id TEXT NOT NULL,
    estimate_revision INTEGER NOT NULL,
    estimate_item_id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    previous_price NUMERIC(18,4) NOT NULL CHECK (previous_price >= 0),
    accepted_price NUMERIC(18,4) NOT NULL CHECK (accepted_price >= 0),
    suggested_observation_id TEXT,
    changed_by TEXT NOT NULL,
    change_reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_history_estimate_item
    ON prosmet_estimate_item_price_history(tenant_id, estimate_id, estimate_item_id, changed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_prosmet_price_history_work
    ON prosmet_estimate_item_price_history(tenant_id, canonical_work_id, changed_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_market_price_buckets (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    unit TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    time_bucket TEXT NOT NULL,
    context_hash TEXT NOT NULL,
    p25 NUMERIC(18,4) NOT NULL CHECK (p25 >= 0),
    median NUMERIC(18,4) NOT NULL CHECK (median >= 0),
    p75 NUMERIC(18,4) NOT NULL CHECK (p75 >= 0),
    trimmed_mean NUMERIC(18,4) NOT NULL CHECK (trimmed_mean >= 0),
    sample_count INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    unique_organizations INTEGER NOT NULL DEFAULT 0,
    confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_market_price_buckets_lookup
    ON prosmet_market_price_buckets(tenant_id, canonical_work_id, region, time_bucket, updated_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_price_research_evidence (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    raw_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL,
    source_label TEXT NOT NULL DEFAULT '',
    observed_price NUMERIC(18,4),
    range_low NUMERIC(18,4),
    range_high NUMERIC(18,4),
    currency TEXT NOT NULL DEFAULT 'RUB',
    confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    observed_at TIMESTAMPTZ NOT NULL,
    raw_evidence TEXT NOT NULL DEFAULT '',
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_research_lookup
    ON prosmet_price_research_evidence(tenant_id, canonical_work_id, region, observed_at DESC);
`;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown, fallback = 0) {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}

function dateValue(value: unknown, fallback = new Date().toISOString()) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function priceIntelligenceEntityKind(payload: unknown) {
  const kind = record(payload).entityKind;
  return typeof kind === "string" ? kind : "";
}

export async function ensurePriceIntelligenceSchema(client: ServerSqlClient) {
  await client.query(PRICE_INTELLIGENCE_SCHEMA_SQL);
}

export async function materializePriceIntelligence(
  client: ServerSqlClient,
  tenantId: string,
  entityId: string,
  rawPayload: unknown
) {
  const payload = record(rawPayload);
  const entityKind = priceIntelligenceEntityKind(payload);
  const json = JSON.stringify(rawPayload ?? {});

  if (entityKind === "canonical_work") {
    await client.query(
      `INSERT INTO prosmet_canonical_works
        (tenant_id, id, canonical_name, category, default_unit, aliases_json,
         active, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         canonical_name = EXCLUDED.canonical_name,
         category = EXCLUDED.category,
         default_unit = EXCLUDED.default_unit,
         aliases_json = EXCLUDED.aliases_json,
         active = EXCLUDED.active,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        entityId,
        stringValue(payload.canonicalName ?? payload.name, entityId),
        stringValue(payload.category),
        stringValue(payload.defaultUnit ?? payload.unit),
        JSON.stringify(Array.isArray(payload.aliases) ? payload.aliases : []),
        payload.active !== false,
        json
      ]
    );
    return true;
  }

  if (entityKind === "price_observation") {
    const context = record(payload.context);
    await client.query(
      `INSERT INTO prosmet_price_observations
        (tenant_id, id, canonical_work_id, raw_name, code, price, currency, unit,
         region, source_type, source_id, source_label, user_id, organization_id,
         estimate_id, estimate_revision, estimate_item_id, suggested_observation_id,
         previous_price, context_hash, context_json, confidence, status, changed_by,
         change_reason, evidence_url, evidence_date, observed_at, valid_from, valid_to,
         payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21::jsonb, $22, $23, $24,
               $25, $26, $27, $28::timestamptz, $29::timestamptz, $30::timestamptz,
               $31::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         canonical_work_id = EXCLUDED.canonical_work_id,
         raw_name = EXCLUDED.raw_name,
         code = EXCLUDED.code,
         price = EXCLUDED.price,
         currency = EXCLUDED.currency,
         unit = EXCLUDED.unit,
         region = EXCLUDED.region,
         source_type = EXCLUDED.source_type,
         source_id = EXCLUDED.source_id,
         source_label = EXCLUDED.source_label,
         estimate_id = EXCLUDED.estimate_id,
         estimate_revision = EXCLUDED.estimate_revision,
         estimate_item_id = EXCLUDED.estimate_item_id,
         context_hash = EXCLUDED.context_hash,
         context_json = EXCLUDED.context_json,
         confidence = EXCLUDED.confidence,
         status = EXCLUDED.status,
         changed_by = EXCLUDED.changed_by,
         change_reason = EXCLUDED.change_reason,
         observed_at = EXCLUDED.observed_at,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        entityId,
        stringValue(payload.canonicalWorkId, "unknown"),
        stringValue(payload.rawName, "Без наименования"),
        stringValue(payload.code),
        Math.max(0, numberValue(payload.price)),
        stringValue(payload.currency, "RUB"),
        stringValue(payload.unit, "шт"),
        stringValue(payload.region),
        stringValue(payload.sourceType, "ai_indicative"),
        optionalString(payload.sourceId),
        stringValue(payload.sourceLabel),
        optionalString(payload.userId),
        optionalString(payload.organizationId),
        optionalString(payload.estimateId),
        optionalNumber(payload.estimateRevision),
        optionalString(payload.estimateItemId),
        optionalString(payload.suggestedObservationId),
        optionalNumber(payload.previousPrice),
        stringValue(payload.contextHash, "ctx_unknown"),
        JSON.stringify(context),
        Math.max(0, Math.min(100, numberValue(payload.confidence))),
        stringValue(payload.status, "suggested"),
        stringValue(payload.changedBy, "system"),
        stringValue(payload.changeReason),
        optionalString(payload.evidenceUrl),
        optionalString(payload.evidenceDate),
        dateValue(payload.observedAt),
        optionalString(payload.validFrom),
        optionalString(payload.validTo),
        json
      ]
    );
    return true;
  }

  if (entityKind === "price_history") {
    await client.query(
      `INSERT INTO prosmet_estimate_item_price_history
        (tenant_id, id, estimate_id, estimate_revision, estimate_item_id,
         canonical_work_id, previous_price, accepted_price, suggested_observation_id,
         changed_by, change_reason, status, changed_at, payload_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
               $13::timestamptz, $14::jsonb, NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         previous_price = EXCLUDED.previous_price,
         accepted_price = EXCLUDED.accepted_price,
         change_reason = EXCLUDED.change_reason,
         status = EXCLUDED.status,
         changed_at = EXCLUDED.changed_at,
         payload_json = EXCLUDED.payload_json`,
      [
        tenantId,
        entityId,
        stringValue(payload.estimateId, "unknown"),
        Math.max(1, integerValue(payload.estimateRevision, 1)),
        stringValue(payload.estimateItemId, "unknown"),
        stringValue(payload.canonicalWorkId, "unknown"),
        Math.max(0, numberValue(payload.previousPrice)),
        Math.max(0, numberValue(payload.acceptedPrice)),
        optionalString(payload.suggestedObservationId),
        stringValue(payload.changedBy, "system"),
        stringValue(payload.changeReason),
        stringValue(payload.status, "edited"),
        dateValue(payload.changedAt),
        json
      ]
    );
    return true;
  }

  if (entityKind === "market_price_bucket") {
    await client.query(
      `INSERT INTO prosmet_market_price_buckets
        (tenant_id, id, canonical_work_id, unit, region, time_bucket, context_hash,
         p25, median, p75, trimmed_mean, sample_count, unique_users,
         unique_organizations, confidence, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         p25 = EXCLUDED.p25,
         median = EXCLUDED.median,
         p75 = EXCLUDED.p75,
         trimmed_mean = EXCLUDED.trimmed_mean,
         sample_count = EXCLUDED.sample_count,
         unique_users = EXCLUDED.unique_users,
         unique_organizations = EXCLUDED.unique_organizations,
         confidence = EXCLUDED.confidence,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        entityId,
        stringValue(payload.canonicalWorkId, "unknown"),
        stringValue(payload.unit, "шт"),
        stringValue(payload.region),
        stringValue(payload.timeBucket, new Date().toISOString().slice(0, 7)),
        stringValue(payload.contextHash, "ctx_unknown"),
        Math.max(0, numberValue(payload.p25)),
        Math.max(0, numberValue(payload.median)),
        Math.max(0, numberValue(payload.p75)),
        Math.max(0, numberValue(payload.trimmedMean)),
        integerValue(payload.sampleCount),
        integerValue(payload.uniqueUsers),
        integerValue(payload.uniqueOrganizations),
        Math.max(0, Math.min(100, numberValue(payload.confidence))),
        json
      ]
    );
    return true;
  }

  if (entityKind === "price_research_evidence") {
    await client.query(
      `INSERT INTO prosmet_price_research_evidence
        (tenant_id, id, canonical_work_id, raw_name, unit, region, source_url,
         source_label, observed_price, range_low, range_high, currency, confidence,
         observed_at, raw_evidence, payload_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, $11, $12, $13, $14::timestamptz, $15, $16::jsonb,
               NOW(), NOW())
       ON CONFLICT (tenant_id, id) DO UPDATE SET
         observed_price = EXCLUDED.observed_price,
         range_low = EXCLUDED.range_low,
         range_high = EXCLUDED.range_high,
         confidence = EXCLUDED.confidence,
         observed_at = EXCLUDED.observed_at,
         raw_evidence = EXCLUDED.raw_evidence,
         payload_json = EXCLUDED.payload_json,
         updated_at = NOW()`,
      [
        tenantId,
        entityId,
        stringValue(payload.canonicalWorkId, "unknown"),
        stringValue(payload.rawName, "Без наименования"),
        stringValue(payload.unit, "шт"),
        stringValue(payload.region),
        stringValue(payload.url),
        stringValue(payload.sourceLabel),
        optionalNumber(payload.observedPrice),
        optionalNumber(payload.rangeLow),
        optionalNumber(payload.rangeHigh),
        stringValue(payload.currency, "RUB"),
        Math.max(0, Math.min(100, numberValue(payload.confidence))),
        dateValue(payload.observedAt),
        stringValue(payload.rawEvidence),
        json
      ]
    );
    return true;
  }

  return false;
}

export async function deletePriceIntelligence(
  client: ServerSqlClient,
  tenantId: string,
  entityId: string
) {
  for (const table of [
    "prosmet_price_observations",
    "prosmet_estimate_item_price_history",
    "prosmet_market_price_buckets",
    "prosmet_price_research_evidence",
    "prosmet_canonical_works"
  ]) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      entityId
    ]);
  }
}
