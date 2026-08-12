import type { Estimate, EstimateItem, MaterialRequirement } from "@prosmet/contracts";

export type EstimateCalculation = {
  itemTotals: Record<string, number>;
  sectionTotals: Record<string, number>;
  direct: number;
  overhead: number;
  profit: number;
  vat: number;
  total: number;
};

// Keep the web calculation aligned with the Rust engine: quantities are stored
// in milli-units, prices in kopeks, and percentages in basis points. All math
// remains integer-based until values are converted back to display currency.
const toQuantityMilli = (value: number) => Math.max(0, Math.round(value * 1_000));
const toPriceCents = (value: number) => Math.max(0, Math.round(value * 100));
const toBasisPoints = (value: number) => Math.max(0, Math.round(value * 100));
const fromCents = (value: number) => value / 100;
const roundDiv = (value: number, divisor: number) => Math.floor((value + divisor / 2) / divisor);

function lineTotalCents(quantity: number, unitPrice: number) {
  return roundDiv(toQuantityMilli(quantity) * toPriceCents(unitPrice), 1_000);
}

export function calculateEstimate(estimate: Estimate): EstimateCalculation {
  const itemTotals: Record<string, number> = {};
  const sectionTotals: Record<string, number> = {};
  let directCents = 0;

  for (const section of estimate.sections) {
    let sectionCents = 0;
    for (const item of section.items) {
      const totalCents = lineTotalCents(item.quantity, item.unitPrice);
      itemTotals[item.id] = fromCents(totalCents);
      sectionCents += totalCents;
    }
    sectionTotals[section.id] = fromCents(sectionCents);
    directCents += sectionCents;
  }

  const overheadCents = roundDiv(
    directCents * toBasisPoints(estimate.overheadPercent),
    10_000
  );
  const profitBaseCents = directCents + overheadCents;
  const profitCents = roundDiv(
    profitBaseCents * toBasisPoints(estimate.profitPercent),
    10_000
  );
  const vatBaseCents = profitBaseCents + profitCents;
  const vatCents = roundDiv(vatBaseCents * toBasisPoints(estimate.vatPercent), 10_000);
  const totalCents = vatBaseCents + vatCents;

  return {
    itemTotals,
    sectionTotals,
    direct: fromCents(directCents),
    overhead: fromCents(overheadCents),
    profit: fromCents(profitCents),
    vat: fromCents(vatCents),
    total: fromCents(totalCents)
  };
}

export function calculateMaterialRequirement(
  area: number,
  consumptionKgPerM2: number,
  wastePercent: number,
  packageKg: number
): MaterialRequirement {
  const areaMilli = Math.max(0, Math.round(area * 1_000));
  const consumptionMilli = Math.max(0, Math.round(consumptionKgPerM2 * 1_000));
  const wasteBasisPoints = Math.max(0, Math.round(wastePercent * 100));
  const packageKgMilli = Math.round(packageKg * 1_000);

  if (packageKgMilli <= 0) throw new Error("packageKg must be positive");

  const netKgMilli = roundDiv(areaMilli * consumptionMilli, 1_000);
  const requiredKgMilli = roundDiv(
    netKgMilli * (10_000 + wasteBasisPoints),
    10_000
  );
  const packages = Math.ceil(requiredKgMilli / packageKgMilli);
  const purchasedKgMilli = packages * packageKgMilli;

  return {
    netKg: netKgMilli / 1_000,
    requiredKg: requiredKgMilli / 1_000,
    packages,
    purchasedKg: purchasedKgMilli / 1_000
  };
}

export function calculateMaterialForItem(item: EstimateItem, area: number) {
  const rule = item.materialRequirement;
  return rule
    ? calculateMaterialRequirement(
        area,
        rule.consumptionKgPerM2,
        rule.wastePercent,
        rule.packageKg
      )
    : null;
}

export function updateEstimateItem(
  estimate: Estimate,
  sectionId: string,
  itemId: string,
  patch: Partial<EstimateItem>
): Estimate {
  return {
    ...estimate,
    updatedAt: new Date().toISOString(),
    sections: estimate.sections.map((section) => section.id === sectionId ? {
      ...section,
      items: section.items.map((item) => item.id === itemId ? { ...item, ...patch } : item)
    } : section)
  };
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(value);
}
