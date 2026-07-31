import type { Estimate, EstimateItem } from "@prosmet/contracts";

export type EstimateCalculation = {
  itemTotals: Record<string, number>;
  sectionTotals: Record<string, number>;
  direct: number;
  overhead: number;
  profit: number;
  vat: number;
  total: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateEstimate(estimate: Estimate): EstimateCalculation {
  const itemTotals: Record<string, number> = {};
  const sectionTotals: Record<string, number> = {};
  let direct = 0;

  for (const section of estimate.sections) {
    let sectionTotal = 0;
    for (const item of section.items) {
      const total = money(Math.max(0, item.quantity) * Math.max(0, item.unitPrice));
      itemTotals[item.id] = total;
      sectionTotal += total;
    }
    sectionTotals[section.id] = money(sectionTotal);
    direct += sectionTotal;
  }

  direct = money(direct);
  const overhead = money(direct * Math.max(0, estimate.overheadPercent) / 100);
  const profit = money((direct + overhead) * Math.max(0, estimate.profitPercent) / 100);
  const vat = money((direct + overhead + profit) * Math.max(0, estimate.vatPercent) / 100);

  return {
    itemTotals,
    sectionTotals,
    direct,
    overhead,
    profit,
    vat,
    total: money(direct + overhead + profit + vat)
  };
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
