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

export type AgentKind = "openai-compatible" | "ollama" | "ag-ui" | "a2a" | "codex-app-server";

export type AgentSummary = {
  id: string;
  name: string;
  kind: AgentKind;
  model: string;
  enabled: boolean;
  isDefault: boolean;
};

export type AdminAgentSummary = AgentSummary & {
  source: "stored" | "environment";
  baseUrl: string;
  endpoint: string;
  cwd: string;
  timeoutMs: number;
  supportsTools: boolean;
  credentialConfigured: boolean;
  apiKeyEnv: string;
  updatedAt: string;
};

export type AgentCatalog = {
  configured: boolean;
  defaultAgentId: string;
  agents: AgentSummary[];
};

export type AgentConfigurationInput = {
  id?: string;
  name: string;
  kind: AgentKind;
  enabled: boolean;
  makeDefault?: boolean;
  model?: string;
  baseUrl?: string;
  endpoint?: string;
  systemPrompt?: string;
  cwd?: string;
  timeoutMs?: number;
  temperature?: number;
  supportsTools?: boolean;
  apiKey?: string;
  apiKeyEnv?: string;
  clearApiKey?: boolean;
};

export type AgentResponse = {
  text: string;
  artifact?: "estimate";
  estimate?: Estimate;
  provider?: AgentSummary;
  latencyMs?: number;
  usage?: unknown;
};

export type ClientManifest = {
  productName: string;
  organizationName: string;
  assistantName: string;
  enabledViews: AppView[];
};
