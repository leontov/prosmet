import type { EstimateDraft, EstimateItem, EstimateSection, EstimateTotals } from "./types";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const qty = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export function calculateItem(item: EstimateItem): EstimateItem {
  return {
    ...item,
    quantity: qty(Math.max(0, item.quantity)),
    unitPrice: money(Math.max(0, item.unitPrice)),
    coefficient: qty(Math.max(0.001, item.coefficient)),
    amount: money(Math.max(0, item.quantity) * Math.max(0, item.unitPrice) * Math.max(0.001, item.coefficient))
  };
}

export function calculateSection(section: EstimateSection): EstimateSection {
  const items = section.items.map(calculateItem);
  return { ...section, items, subtotal: money(items.reduce((sum, item) => sum + item.amount, 0)) };
}

export function calculateTotals(
  sections: EstimateSection[],
  rates: Pick<EstimateDraft, "overheadRate" | "profitRate" | "discountRate" | "vatRate">
): EstimateTotals {
  const directCost = money(sections.reduce((sum, section) => sum + section.subtotal, 0));
  const overhead = money(directCost * (rates.overheadRate / 100));
  const profit = money((directCost + overhead) * (rates.profitRate / 100));
  const beforeDiscount = directCost + overhead + profit;
  const discount = money(beforeDiscount * (rates.discountRate / 100));
  const taxable = beforeDiscount - discount;
  const vat = money(taxable * (rates.vatRate / 100));
  return { directCost, overhead, profit, discount, vat, grandTotal: money(taxable + vat) };
}

export function recalculateEstimate(estimate: EstimateDraft, nextRevision = estimate.revision): EstimateDraft {
  const sections = estimate.sections.map(calculateSection);
  return {
    ...estimate,
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    sections,
    totals: calculateTotals(sections, estimate)
  };
}

export function reviseEstimate(estimate: EstimateDraft, mutate: (draft: EstimateDraft) => EstimateDraft): EstimateDraft {
  const next = mutate(structuredClone(estimate));
  return recalculateEstimate(next, estimate.revision + 1);
}
