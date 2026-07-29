import "server-only";

import {
  PriceObservationSchema,
  aggregateMarketPrices,
  rankPriceCandidates,
  type PriceContext
} from "@/lib/domain/price-intelligence";
import {
  ensureTenant,
  getServerDatabase,
  withServerTransaction
} from "@/lib/server/postgres";
import { ensurePriceIntelligenceSchema } from "../price-intelligence-compat";
import { materializePriceIntelligence } from "../price-intelligence";

/**
 * The IndexedDB outbox stores every immutable price entity in the legacy
 * tenant-scoped `prosmet_prices` envelope for transport. This routine projects
 * those envelopes into the normalized Price Intelligence tables. It does not
 * create a second schema: the canonical compatibility migration owns all DDL.
 */
export async function materializeSyncedPriceIntelligence(tenantId: string) {
  await ensureTenant(tenantId);
  await withServerTransaction(async (client) => {
    await ensurePriceIntelligenceSchema(client);
    const rows = await client.query<{ id: string; payload: unknown }>(
      `SELECT id, payload_json AS payload
         FROM prosmet_prices
        WHERE tenant_id = $1
          AND payload_json->>'entityKind' IN
              ('canonical_work', 'price_observation', 'price_history',
               'market_price_bucket', 'price_research_evidence')
        ORDER BY updated_at ASC
        LIMIT 5000`,
      [tenantId]
    );

    for (const row of rows.rows) {
      await materializePriceIntelligence(client, tenantId, row.id, row.payload);
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
        AND currency = $4
      ORDER BY observed_at DESC
      LIMIT 1000`,
    [input.tenantId, input.canonicalWorkId, input.unit, input.currency]
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
  const selected = candidates[0] ?? null;

  return {
    selected,
    candidates: candidates.slice(0, 20),
    market,
    coverage: {
      observations: observations.length,
      needsResearch:
        !selected ||
        selected.score < 0.35 ||
        (market !== null && (market.sampleCount < 5 || market.confidence < 55))
    }
  };
}
