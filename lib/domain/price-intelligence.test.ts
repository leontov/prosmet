import { describe, expect, it } from "vitest";
import {
  PriceObservationSchema,
  aggregateMarketPrices,
  canonicalWorkId,
  priceContextHash,
  rankPriceCandidates,
  type PriceObservation,
  type PriceSourceType
} from "@/lib/domain/price-intelligence";

const workId = canonicalWorkId("Механизированная гипсовая штукатурка", "м²");
const context = {
  materialsIncluded: false,
  deliveryIncluded: false,
  equipmentIncluded: false,
  vatIncluded: false,
  layerThicknessMm: 15,
  constrainedConditions: false,
  qualityLevel: "standard",
  urgency: "normal",
  season: "summer"
};

function observation(
  id: string,
  price: number,
  sourceType: PriceSourceType,
  status: PriceObservation["status"],
  overrides: Partial<PriceObservation> = {}
) {
  const timestamp = new Date().toISOString();
  return PriceObservationSchema.parse({
    id,
    canonicalWorkId: workId,
    rawName: "Механизированная гипсовая штукатурка",
    price,
    currency: "RUB",
    unit: "м²",
    region: "Лениногорск",
    sourceType,
    sourceLabel: sourceType,
    observedAt: timestamp,
    context,
    contextHash: priceContextHash(context),
    confidence: 90,
    status,
    changedBy: "system",
    createdAt: timestamp,
    ...overrides
  });
}

describe("Price Intelligence", () => {
  it("prefers an executed personal price over a regional or researched price", () => {
    const candidates = rankPriceCandidates({
      observations: [
        observation("external", 610, "external_research", "researched"),
        observation("regional", 650, "regional_market", "approved"),
        observation("personal", 700, "personal", "executed")
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      currency: "RUB",
      context
    });

    expect(candidates[0]?.observation.id).toBe("personal");
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });

  it("penalizes incompatible price context", () => {
    const candidates = rankPriceCandidates({
      observations: [
        observation("matching", 700, "personal", "approved"),
        observation("with-materials", 900, "personal", "approved", {
          context: { ...context, materialsIncluded: true },
          contextHash: priceContextHash({ ...context, materialsIncluded: true })
        })
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      currency: "RUB",
      context
    });

    expect(candidates[0]?.observation.id).toBe("matching");
    expect(candidates[1]?.contextWeight).toBeLessThan(candidates[0]?.contextWeight ?? 0);
  });

  it("excludes a large outlier from the regional market range", () => {
    const prices = [500, 550, 600, 620, 650, 680, 700, 750, 3000];
    const bucket = aggregateMarketPrices({
      observations: prices.map((price, index) =>
        observation(`market-${index}`, price, "regional_market", "approved", {
          userId: `user-${index}`,
          organizationId: `org-${index}`
        })
      ),
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      context,
      timeBucket: "2026-07"
    });

    expect(bucket).not.toBeNull();
    expect(bucket?.p75).toBeLessThan(1000);
    expect(bucket?.median).toBeGreaterThanOrEqual(600);
    expect(bucket?.median).toBeLessThanOrEqual(700);
    expect(bucket?.sampleCount).toBe(8);
  });

  it("keeps official and commercial observations distinguishable", () => {
    const candidates = rankPriceCandidates({
      observations: [
        observation("official", 612, "official", "researched"),
        observation("commercial", 680, "regional_market", "approved")
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      currency: "RUB",
      context
    });

    expect(candidates.map((entry) => entry.observation.sourceType)).toContain("official");
    expect(candidates.map((entry) => entry.observation.sourceType)).toContain("regional_market");
  });

  it("never resolves rejected or suspicious observations", () => {
    const candidates = rankPriceCandidates({
      observations: [
        observation("accepted", 700, "personal", "approved"),
        observation("rejected", 1, "personal", "rejected"),
        observation("suspicious", 99999, "personal", "suspicious")
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      currency: "RUB",
      context
    });

    expect(candidates.map((candidate) => candidate.observation.id)).toEqual(["accepted"]);
  });

  it("prefers a recent observation when all other signals are equal", () => {
    const candidates = rankPriceCandidates({
      observations: [
        observation("old", 680, "personal", "approved", {
          observedAt: "2023-01-01T00:00:00.000Z",
          createdAt: "2023-01-01T00:00:00.000Z"
        }),
        observation("recent", 700, "personal", "approved", {
          observedAt: "2026-07-01T00:00:00.000Z",
          createdAt: "2026-07-01T00:00:00.000Z"
        })
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      currency: "RUB",
      context
    });

    expect(candidates[0]?.observation.id).toBe("recent");
    expect(candidates[0]?.recencyWeight).toBeGreaterThan(candidates[1]?.recencyWeight ?? 0);
  });

  it("reports independent users and organizations in a regional bucket", () => {
    const bucket = aggregateMarketPrices({
      observations: [
        observation("one", 620, "personal", "sent_to_client", {
          userId: "user-1",
          organizationId: "org-1"
        }),
        observation("two", 650, "organization", "contracted", {
          userId: "user-2",
          organizationId: "org-2"
        }),
        observation("three", 680, "regional_market", "approved", {
          userId: "user-3",
          organizationId: "org-2"
        })
      ],
      canonicalWorkId: workId,
      unit: "м²",
      region: "Лениногорск",
      context,
      timeBucket: "2026-07"
    });

    expect(bucket?.sampleCount).toBe(3);
    expect(bucket?.uniqueUsers).toBe(3);
    expect(bucket?.uniqueOrganizations).toBe(2);
    expect(bucket?.p25).toBeLessThanOrEqual(bucket?.median ?? 0);
    expect(bucket?.median).toBeLessThanOrEqual(bucket?.p75 ?? 0);
  });
});
