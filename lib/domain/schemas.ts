import { z } from "zod";

export const priceSourceSchema = z.object({
  label: z.string().min(1),
  type: z.enum(["personal", "organization", "previous-estimate", "supplier", "regional", "official", "external", "assumption", "unknown"]),
  region: z.string().min(1),
  date: z.string().nullable(),
  includesVat: z.boolean().nullable(),
  includesDelivery: z.boolean().nullable(),
  confidence: z.enum(["high", "medium", "low", "unknown"]),
  confirmed: z.boolean()
});

export const estimateItemSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  code: z.string().nullable(),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().finite().nonnegative(),
  norm: z.number().finite().nonnegative().nullable(),
  unitPrice: z.number().finite().nonnegative(),
  coefficient: z.number().finite().positive(),
  amount: z.number().finite().nonnegative(),
  resourceType: z.enum(["work", "material", "machine", "equipment", "labor", "logistics", "service"]),
  priceSource: priceSourceSchema,
  comment: z.string().nullable(),
  warning: z.string().nullable()
});

export const estimateSectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int().nonnegative(),
  items: z.array(estimateItemSchema),
  subtotal: z.number().finite().nonnegative()
});

export const estimateDraftSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  title: z.string().min(1),
  projectName: z.string().min(1),
  customer: z.string().nullable(),
  contractor: z.string().nullable(),
  region: z.string().min(1),
  calculationMethod: z.enum(["resource", "base-index", "resource-index", "commercial", "contractor", "mixed"]),
  currency: z.literal("RUB"),
  createdAt: z.string(),
  updatedAt: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  sections: z.array(estimateSectionSchema),
  overheadRate: z.number().finite().nonnegative(),
  profitRate: z.number().finite().nonnegative(),
  discountRate: z.number().finite().nonnegative(),
  vatRate: z.number().finite().nonnegative(),
  totals: z.object({
    directCost: z.number(),
    overhead: z.number(),
    profit: z.number(),
    discount: z.number(),
    vat: z.number(),
    grandTotal: z.number()
  })
});

export const reviseEstimateRequestSchema = z.object({
  estimate: estimateDraftSchema,
  reason: z.string().min(1).max(500),
  baseRevision: z.number().int().positive()
});
