import "server-only";

import {
  MarketPriceBucketSchema,
  PriceHistoryEventSchema,
  PriceObservationSchema,
  aggregateMarketPrices,
  rankPriceCandidates,
  type PriceContext,
  type PriceObservation
} from "@/lib/domain/price-intelligence";
import {
  ensureTenant,
  getServerDatabase,
  withServerTransaction,
  type ServerSqlClient
} from "@/lib/server/postgres";

const PRICE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS prosmet_canonical_works (
    id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    synonyms_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    technology_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    inclusions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    exclusions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS prosmet_price_observations (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    raw_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    price NUMERIC(18,4) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    region TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    observed_at TIMESTAMPTZ NOT NULL,
    context_hash TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_lookup
    ON prosmet_price_observations(tenant_id, canonical_work_id, unit, region, observed_at DESC);

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_observations_status
    ON prosmet_price_observations(tenant_id, status, observed_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_estimate_item_price_history (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    estimate_id TEXT NOT NULL,
    estimate_item_id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    previous_price NUMERIC(18,4) NOT NULL,
    accepted_price NUMERIC(18,4) NOT NULL,
    status TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    payload_json JSONB NOT NULL,
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_price_history_item
    ON prosmet_estimate_item_price_history(tenant_id, estimate_id, estimate_item_id, changed_at DESC);

  CREATE TABLE IF NOT EXISTS prosmet_user_price_profiles (
    tenant_id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    context_hash TEXT NOT NULL,
    preferred_price NUMERIC(18,4),
    last_approved_price NUMERIC(18,4),
    range_low NUMERIC(18,4),
    range_high NUMERIC(18,4),
    sample_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, canonical_work_id, region, context_hash),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_organization_price_profiles (
    tenant_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    context_hash TEXT NOT NULL,
    preferred_price NUMERIC(18,4),
    last_approved_price NUMERIC(18,4),
    range_low NUMERIC(18,4),
    range_high NUMERIC(18,4),
    sample_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, organization_id, canonical_work_id, region, context_hash),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS prosmet_market_price_buckets (
    id TEXT PRIMARY KEY,
    canonical_work_id TEXT NOT NULL,
    unit TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    time_bucket TEXT NOT NULL,
    context_hash TEXT NOT NULL,
    p25 NUMERIC(18,4) NOT NULL,
    median NUMERIC(18,4) NOT NULL,
    p75 NUMERIC(18,4) NOT NULL,
    trimmed_mean NUMERIC(18,4) NOT NULL,
    sample_count INTEGER NOT NULL,
    unique_users INTEGER NOT NULL DEFAULT 0,
    unique_organizations INTEGER NOT NULL DEFAULT 0,
    confidence NUMERIC(7,3) NOT NULL DEFAULT 0,
    payload_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_prosmet_market_price_lookup
    ON prosmet_market_price_buckets(canonical_work_id, unit, region, time_bucket DESC);

  CREATE TABLE IF NOT EXISTS prosmet_price_research_evidence (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    canonical_work_id TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT '',
    source_url TEXT,
    observed_at TIMESTAMPTZ,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id),
    FOREIGN KEY (tenant_id) REFERENCES prosmet_tenants(id) ON DELETE CASCADE
  );
`;

async function ensurePriceSchema(client: ServerSqlClient) {
  await client.query(PRICE_SCHEMA_SQL);
}

async function materializeObservation(
  client: ServerSqlClient,
  tenantId: string,
  observation: PriceObservation
) {
  await client.query(
    `INSERT INTO prosmet_price_observations
      (tenant_id, id, canonical_work_id, raw_name, unit, price, currency,
       region, source_type, status, confidence, observed_at, context_hash,
       payload_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12::timestamptz, $13, $14::jsonb, NOW(), NOW())
     ON CONFLICT (tenant_id, id) DO UPDATE SET
       canonical_work_id = EXCLUDED.canonical_work_id,
       raw_name = EXCLUDED.raw_name,
       unit = EXCLUDED.unit,
       price = EXCLUDED.price,
       currency = EXCLUDED.currency,
       region = EXCLUDED.region,
       source_type = EXCLUDED.source_type,
       status = EXCLUDED.status,
       confidence = EXCLUDED.confidence,
       observed_at = EXCLUDED.observed_at,
       context_hash = EXCLUDED.context_hash,
       payload_json = EXCLUDED.payload_json,
       updated_at = NOW()`,
    [
      tenantId,
      observation.id,
      observation.canonicalWorkId,
      observation.rawName,
      observation.unit,
      observation.price,
      observation.currency,
      observation.region,
      observation.sourceType,
      observation.status,
      observation.confidence,
      observation.observedAt,
      observation.contextHash,
      JSON.stringify(observation)
    ]
  );
}

export async function materializeSyncedPriceIntelligence(tenantId: string) {
  await ensureTenant(tenantId);
  await withServerTransaction(async (client) => {
    await ensurePriceSchema(client);
    const rows = await client.query<{ id: string; payload: unknown }>(
      `SELECT id, payload_json AS payload
         FROM prosmet_prices
        WHERE tenant_id = $1
          AND payload_json->>'entityKind' IN
              ('price_observation', 'price_history', 'market_price_bucket', 'price_research_evidence')`,
      [tenantId]
    );

    for (const row of rows.rows) {
      const observation = PriceObservationSchema.safeParse(row.payload);
      if (observation.success) {
        await materializeObservation(client, tenantId, observation.data);
        continue;
      }

      const history = PriceHistoryEventSchema.safeParse(row.payload);
      if (history.success) {
        await client.query(
          `INSERT INTO prosmet_estimate_item_price_history
            (tenant_id, id, estimate_id, estimate_item_id, canonical_work_id,
             previous_price, accepted_price, status, changed_at, payload_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::jsonb)
           ON CONFLICT (tenant_id, id) DO UPDATE SET
             previous_price = EXCLUDED.previous_price,
             accepted_price = EXCLUDED.accepted_price,
             status = EXCLUDED.status,
             changed_at = EXCLUDED.changed_at,
             payload_json = EXCLUDED.payload_json`,
          [
            tenantId,
            history.data.id,
            history.data.estimateId,
            history.data.estimateItemId,
            history.data.canonicalWorkId,
            history.data.previousPrice,
            history.data.acceptedPrice,
            history.data.status,
            history.data.changedAt,
            JSON.stringify(history.data)
          ]
        );
        continue;
      }

      const bucket = MarketPriceBucketSchema.safeParse(row.payload);
      if (bucket.success) {
        await client.query(
          `INSERT INTO prosmet_market_price_buckets
            (id, canonical_work_id, unit, region, time_bucket, context_hash,
             p25, median, p75, trimmed_mean, sample_count, unique_users,
             unique_organizations, confidence, payload_json, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                   $13, $14, $15::jsonb, NOW())
           ON CONFLICT (id) DO UPDATE SET
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
            bucket.data.id,
            bucket.data.canonicalWorkId,
            bucket.data.unit,
            bucket.data.region,
            bucket.data.timeBucket,
            bucket.data.contextHash,
            bucket.data.p25,
            bucket.data.median,
            bucket.data.p75,
            bucket.data.trimmedMean,
            bucket.data.sampleCount,
            bucket.data.uniqueUsers,
            bucket.data.uniqueOrganizations,
            bucket.data.confidence,
            JSON.stringify(bucket.data)
          ]
        );
        continue;
      }

      if (
        row.payload &&
        typeof row.payload === "object" &&
        !Array.isArray(row.payload) &&
        (row.payload as Record<string, unknown>).entityKind === "price_research_evidence"
      ) {
        const payload = row.payload as Record<string, unknown>;
        await client.query(
          `INSERT INTO prosmet_price_research_evidence
            (tenant_id, id, canonical_work_id, region, source_url, observed_at,
             payload_json, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb, NOW())
           ON CONFLICT (tenant_id, id) DO UPDATE SET
             payload_json = EXCLUDED.payload_json`,
          [
            tenantId,
            row.id,
            typeof payload.canonicalWorkId === "string" ? payload.canonicalWorkId : "unknown",
            typeof payload.region === "string" ? payload.region : "",
            typeof payload.url === "string" ? payload.url : null,
            typeof payload.observedAt === "string" ? payload.observedAt : null,
            JSON.stringify(payload)
          ]
        );
      }
    }
  });
}

export async function resolveServerPrice(input: {
  tenantId: string;
  canonicalWorkId: string;
  unit: string;
  region: string;
  currency: string;
  context?: Partial<PriceContext>;
}) {
  await materializeSyncedPriceIntelligence(input.tenantId);
  const rows = await (await getServerDatabase()).query<{ payload: unknown }>(
    `SELECT payload_json AS payload
       FROM prosmet_price_observations
      WHERE tenant_id = $1
        AND canonical_work_id = $2
        AND unit = $3
      ORDER BY observed_at DESC
      LIMIT 1000`,
    [input.tenantId, input.canonicalWorkId, input.unit]
  );
  const observations = rows.rows.flatMap((row) => {
    const parsed = PriceObservationSchema.safeParse(row.payload);
    return parsed.success ? [parsed.data] : [];
  });
  const candidates = rankPriceCandidates({
    observations,
    canonicalWorkId: input.canonicalWorkId,
    unit: input.unit,
    region: input.region,
    currency: input.currency,
    context: input.context
  });
  const market = aggregateMarketPrices({
    observations,
    canonicalWorkId: input.canonicalWorkId,
    unit: input.unit,
    region: input.region,
    context: input.context
  });

  return {
    selected: candidates[0] ?? null,
    candidates: candidates.slice(0, 20),
    market,
    coverage: {
      observations: observations.length,
      needsResearch:
        candidates.length === 0 ||
        (candidates[0]?.score ?? 0) < 0.35 ||
        (market !== null && market.sampleCount < 5)
    }
  };
}
