export type ResourceType = "work" | "material" | "machine" | "equipment" | "labor" | "logistics" | "service";
export type PriceSourceType = "personal" | "organization" | "previous-estimate" | "supplier" | "regional" | "official" | "external" | "assumption" | "unknown";
export type Confidence = "high" | "medium" | "low" | "unknown";

export interface PriceSource {
  label: string;
  type: PriceSourceType;
  region: string;
  date: string | null;
  includesVat: boolean | null;
  includesDelivery: boolean | null;
  confidence: Confidence;
  confirmed: boolean;
}

export interface EstimateItem {
  id: string;
  sectionId: string;
  code: string | null;
  name: string;
  unit: string;
  quantity: number;
  norm: number | null;
  unitPrice: number;
  coefficient: number;
  amount: number;
  resourceType: ResourceType;
  priceSource: PriceSource;
  comment: string | null;
  warning: string | null;
}

export interface EstimateSection {
  id: string;
  name: string;
  sortOrder: number;
  items: EstimateItem[];
  subtotal: number;
}

export interface EstimateTotals {
  directCost: number;
  overhead: number;
  profit: number;
  discount: number;
  vat: number;
  grandTotal: number;
}

export interface EstimateDraft {
  id: string;
  revision: number;
  title: string;
  projectName: string;
  customer: string | null;
  contractor: string | null;
  region: string;
  calculationMethod: "resource" | "base-index" | "resource-index" | "commercial" | "contractor" | "mixed";
  currency: "RUB";
  createdAt: string;
  updatedAt: string;
  assumptions: string[];
  warnings: string[];
  sections: EstimateSection[];
  overheadRate: number;
  profitRate: number;
  discountRate: number;
  vatRate: number;
  totals: EstimateTotals;
}

export interface TechnologyOperation {
  id: string;
  stage: string;
  description: string;
  required: boolean;
  basis: "request" | "technology" | "assumption";
}

export interface TechnologyCard {
  id: string;
  title: string;
  workType: string;
  region: string;
  inputs: Record<string, string | number | boolean | null>;
  operations: TechnologyOperation[];
  assumptions: string[];
  missingCriticalData: string[];
}

export interface EstimateReview {
  status: "passed-with-warnings" | "requires-action" | "rejected";
  reviewer: string;
  score: number;
  checks: Array<{ name: string; status: "passed" | "warning" | "failed"; detail: string }>;
}

export interface AgentState {
  project: { id: string; name: string; region: string } | null;
  activeEstimate: EstimateDraft | null;
  estimateRevision: number;
  documents: Array<{ id: string; type: string; status: string }>;
  priceContext: { region: string; unconfirmedCount: number };
  workTrace: Array<{ id: string; label: string; status: "pending" | "running" | "complete" | "error" }>;
  sync: { status: "local" | "syncing" | "synced" | "offline"; cursor: string | null };
  provider: { id: string; model: string | null; mode: "deterministic" | "llm" };
  validation: { status: string; warnings: number };
}
