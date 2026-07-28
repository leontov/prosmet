import Decimal from "decimal.js";
import { z } from "zod";
import { browserUuid } from "@/lib/platform/browser-crypto";

export const ResourceTypeSchema = z.enum([
  "work",
  "material",
  "machine",
  "equipment",
  "labor",
  "service",
  "logistics"
]);

export const PriceSourceSchema = z.object({
  label: z.string().min(1),
  kind: z.enum([
    "personal",
    "organization",
    "previous-estimate",
    "supplier",
    "regional",
    "official",
    "external",
    "indicative",
    "unknown"
  ]),
  region: z.string().default(""),
  date: z.string().default(""),
  currency: z.string().default("RUB"),
  vatIncluded: z.boolean().default(false),
  deliveryIncluded: z.boolean().default(false),
  confidence: z.number().min(0).max(100).default(0),
  confirmed: z.boolean().default(false)
});

export const EstimateItemSchema = z.object({
  id: z.string().min(1),
  code: z.string().default(""),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().finite().nonnegative(),
  norm: z.number().finite().positive().default(1),
  coefficient: z.number().finite().positive().default(1),
  unitPrice: z.number().finite().nonnegative(),
  resourceType: ResourceTypeSchema,
  source: PriceSourceSchema,
  comment: z.string().default(""),
  warning: z.string().default("")
});

export const EstimateSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(EstimateItemSchema)
});

export const TechnologyStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  control: z.string().default(""),
  resources: z.array(z.string()).default([])
});

export const EstimateDraftSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objectName: z.string().default(""),
  customer: z.string().default(""),
  contractor: z.string().default(""),
  region: z.string().default(""),
  date: z.string().default(() => new Date().toISOString().slice(0, 10)),
  method: z
    .enum([
      "resource",
      "base-index",
      "resource-index",
      "commercial",
      "contractor-calculation",
      "mixed"
    ])
    .default("commercial"),
  currency: z.string().default("RUB"),
  status: z.enum(["draft", "review", "approved", "sent"]).default("draft"),
  revision: z.number().int().positive().default(1),
  technology: z.array(TechnologyStepSchema).default([]),
  sections: z.array(EstimateSectionSchema),
  overheadPercent: z.number().finite().nonnegative().default(0),
  profitPercent: z.number().finite().nonnegative().default(0),
  discountPercent: z.number().finite().nonnegative().default(0),
  vatPercent: z.number().finite().nonnegative().default(0),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  reviewerNotes: z.array(z.string()).default([]),
  updatedAt: z.string().default(() => new Date().toISOString())
});

export type ResourceType = z.infer<typeof ResourceTypeSchema>;
export type PriceSource = z.infer<typeof PriceSourceSchema>;
export type EstimateItem = z.infer<typeof EstimateItemSchema>;
export type EstimateSection = z.infer<typeof EstimateSectionSchema>;
export type TechnologyStep = z.infer<typeof TechnologyStepSchema>;
export type EstimateDraft = z.infer<typeof EstimateDraftSchema>;

export type EstimateCalculation = {
  itemAmounts: Record<string, number>;
  sectionTotals: Record<string, number>;
  directCost: number;
  overhead: number;
  profit: number;
  discount: number;
  subtotal: number;
  vat: number;
  total: number;
};

function money(value: Decimal.Value) {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function calculateEstimate(draft: EstimateDraft): EstimateCalculation {
  const itemAmounts: Record<string, number> = {};
  const sectionTotals: Record<string, number> = {};
  let direct = new Decimal(0);

  for (const section of draft.sections) {
    let sectionTotal = new Decimal(0);
    for (const item of section.items) {
      const amount = money(item.quantity)
        .mul(item.norm)
        .mul(item.coefficient)
        .mul(item.unitPrice);
      const rounded = money(amount);
      itemAmounts[item.id] = rounded.toNumber();
      sectionTotal = sectionTotal.plus(rounded);
    }
    sectionTotals[section.id] = money(sectionTotal).toNumber();
    direct = direct.plus(sectionTotal);
  }

  const overhead = money(direct.mul(draft.overheadPercent).div(100));
  const profitBase = direct.plus(overhead);
  const profit = money(profitBase.mul(draft.profitPercent).div(100));
  const beforeDiscount = profitBase.plus(profit);
  const discount = money(beforeDiscount.mul(draft.discountPercent).div(100));
  const subtotal = money(beforeDiscount.minus(discount));
  const vat = money(subtotal.mul(draft.vatPercent).div(100));
  const total = money(subtotal.plus(vat));

  return {
    itemAmounts,
    sectionTotals,
    directCost: money(direct).toNumber(),
    overhead: overhead.toNumber(),
    profit: profit.toNumber(),
    discount: discount.toNumber(),
    subtotal: subtotal.toNumber(),
    vat: vat.toNumber(),
    total: total.toNumber()
  };
}

export function cloneEstimate(draft: EstimateDraft): EstimateDraft {
  return EstimateDraftSchema.parse(structuredClone(draft));
}

export function validateForApproval(draft: EstimateDraft) {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!draft.technology.length) blockers.push("Отсутствует технологическая карта.");
  if (!draft.sections.length) blockers.push("Смета не содержит разделов.");

  for (const section of draft.sections) {
    if (!section.items.length) blockers.push(`Раздел «${section.title}» пуст.`);
    for (const item of section.items) {
      if (!item.name.trim()) blockers.push("Есть позиция без наименования.");
      if (!item.unit.trim()) blockers.push(`У позиции «${item.name}» нет единицы.`);
      if (!(item.quantity > 0)) blockers.push(`У позиции «${item.name}» не задан объём.`);
      if (!(item.norm > 0)) blockers.push(`У позиции «${item.name}» не задана норма.`);
      if (!(item.coefficient > 0)) blockers.push(`У позиции «${item.name}» неверный коэффициент.`);
      if (!(item.unitPrice > 0)) blockers.push(`У позиции «${item.name}» отсутствует цена.`);
      if (item.unitPrice > 0 && item.source.kind === "unknown") {
        blockers.push(`У позиции «${item.name}» отсутствует источник цены.`);
      }
      if (item.source.confidence < 70) {
        warnings.push(`Низкая уверенность в цене «${item.name}».`);
      }
      if (item.warning.trim()) warnings.push(item.warning.trim());
    }
  }

  const calculation = calculateEstimate(draft);
  if (!(calculation.total > 0)) blockers.push("Итог сметы должен быть больше нуля.");
  warnings.push(...draft.warnings.filter(Boolean));
  return { canApprove: blockers.length === 0, blockers, warnings, calculation };
}

export function makeId(prefix: string) {
  return `${prefix}_${browserUuid()}`;
}
