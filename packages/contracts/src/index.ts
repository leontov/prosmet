export type AppView =
  | "chat"
  | "projects"
  | "estimates"
  | "documents"
  | "catalog"
  | "account"
  | "settings";

export type EstimateStatus = "draft" | "review" | "approved" | "sent";

export type EstimateItem = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  category: "work" | "material" | "equipment" | "logistics";
};

export type EstimateSection = {
  id: string;
  title: string;
  items: EstimateItem[];
};

export type Estimate = {
  id: string;
  title: string;
  project: string;
  customer: string;
  region: string;
  revision: number;
  status: EstimateStatus;
  overheadPercent: number;
  profitPercent: number;
  vatPercent: number;
  sections: EstimateSection[];
  updatedAt: string;
};

export type AgentResponse = {
  text: string;
  artifact?: "estimate";
  estimate?: Estimate;
};

export type ClientManifest = {
  productName: string;
  organizationName: string;
  assistantName: string;
  enabledViews: AppView[];
};
