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

export type EstimatePersistence = {
  database: "sqlite" | "postgresql";
  ownerId: string;
  sourceAgentId: string | null;
  sourceRequestId: string | null;
  createdAt: string;
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
  persistence?: EstimatePersistence;
};

export type EstimateArtifactReference = {
  type: "estimate";
  id: string;
  revision: number;
  database: "sqlite" | "postgresql";
};

export type ConstructionQuickAction = {
  id: "create-estimate" | "calculate-measurements" | "prepare-documents";
  title: string;
  prompt: string;
  artifactType: "estimate" | "document-set";
};

export type CapabilityManifest = {
  vertical: "construction-estimates-ru";
  workflow: [
    "brief",
    "technology-card",
    "price-research",
    "estimate",
    "construction-documents"
  ];
  quickActions: ConstructionQuickAction[];
  supportedArtifacts: Array<"estimate" | "commercial-proposal" | "contract" | "ks-2" | "ks-3" | "invoice">;
};

export type AgentProviderKind =
  | "openai-compatible"
  | "ollama"
  | "codex-app-server"
  | "http-agent";

export type AgentDescriptor = {
  id: string;
  name: string;
  type: AgentProviderKind;
  enabled: boolean;
  active: boolean;
  model: string | null;
  baseUrl: string | null;
  command: string | null;
  args: string[];
  cwd: string | null;
  systemPrompt: string | null;
  timeoutMs: number;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentConfigInput = {
  name: string;
  type: AgentProviderKind;
  enabled?: boolean;
  model?: string | null;
  baseUrl?: string | null;
  command?: string | null;
  args?: string[];
  cwd?: string | null;
  systemPrompt?: string | null;
  timeoutMs?: number;
  secret?: string | null;
};

export type AgentRegistryResponse = {
  agents: AgentDescriptor[];
  activeAgentId: string | null;
  adminAuthenticated: boolean;
  bootstrapRequired: boolean;
};

export type AgentTestResult = {
  ok: boolean;
  agentId: string;
  latencyMs: number;
  provider: AgentProviderKind;
  model: string | null;
  message: string;
};

export type AgentResponse = {
  text: string;
  artifact?: EstimateArtifactReference | null;
  agent?: {
    id: string;
    name: string;
    type: AgentProviderKind;
    model: string | null;
  };
};

export type EstimateListResponse = {
  estimates: Estimate[];
  persistence: "sqlite" | "postgresql";
};

export type AdminSessionStatus = {
  authenticated: boolean;
  bootstrapRequired: boolean;
};

export type AccountProfile = {
  name: string;
  email: string;
  organization: string;
  region: string;
  role: "super_admin";
  updatedAt: string;
};

export type SystemStatus = {
  ok: true;
  app: string;
  releaseSha: string;
  ui: string;
  activeAgent: AgentDescriptor | null;
  configuredAgents: number;
  adminAuthenticated: boolean;
  bootstrapRequired: boolean;
  profileConfigured: boolean;
  persistence: "server-encrypted-file" | "sqlite-artifact-store";
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ClientManifest = {
  productName: string;
  organizationName: string;
  assistantName: string;
  enabledViews: AppView[];
};
