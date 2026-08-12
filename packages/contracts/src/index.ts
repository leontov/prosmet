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
  /** Optional deterministic material-consumption rule used by the estimate engine. */
  materialRequirement?: MaterialRequirementRule;
};

export type EstimateSection = {
  id: string;
  title: string;
  items: EstimateItem[];
};

export type MaterialRequirementRule = {
  basis: "area";
  consumptionKgPerM2: number;
  wastePercent: number;
  packageKg: number;
};

export type MaterialRequirement = {
  netKg: number;
  requiredKg: number;
  packages: number;
  purchasedKg: number;
};

export type EstimateCalculation = {
  direct: number;
  overhead: number;
  profit: number;
  vat: number;
  total: number;
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
  calculation?: EstimateCalculation;
  persistence?: EstimatePersistence;
};

export type ProjectStatus =
  | "estimate_draft"
  | "estimate_review"
  | "estimate_sent"
  | "estimate_approved"
  | "proposal_ready"
  | "contract_ready"
  | "contracted"
  | "in_progress"
  | "completion_review"
  | "completed";

export type ConstructionProject = {
  id: string;
  title: string;
  customer: string;
  region: string;
  status: ProjectStatus;
  activeEstimateId: string;
  createdAt: string;
  updatedAt: string;
  totals: { estimate: number; planned: number; actual: number };
  progress: { completedItems: number; totalItems: number; percent: number };
};

export type ConstructionDocumentType =
  | "commercial-proposal"
  | "invoice"
  | "contract"
  | "act"
  | "ks-2"
  | "ks-3";

export type ConstructionDocumentStatus =
  | "draft"
  | "ready"
  | "sent"
  | "signed"
  | "approved";

export type ConstructionDocument = {
  id: string;
  projectId: string;
  estimateId: string;
  type: ConstructionDocumentType;
  status: ConstructionDocumentStatus;
  number: string;
  title: string;
  content: {
    heading: string;
    introduction: string;
    sections: Array<{
      title: string;
      lines: Array<{ name: string; unit: string; quantity: number; unitPrice: number; total: number }>;
    }>;
    totals: { direct: number; overhead: number; profit: number; vat: number; total: number };
    clauses: string[];
    notes: string[];
  };
  createdAt: string;
  updatedAt: string;
};

export type WorkProgressStatus = "planned" | "started" | "done" | "excluded";

export type WorkProgressItem = {
  projectId: string;
  estimateId: string;
  sectionId: string;
  itemId: string;
  name: string;
  unit: string;
  category: EstimateItem["category"];
  plannedQuantity: number;
  actualQuantity: number;
  unitPrice: number;
  status: WorkProgressStatus;
  note: string;
  updatedAt: string;
};

export type EstimateRevision = {
  id: string;
  estimateId: string;
  revision: number;
  event: string;
  status: EstimateStatus;
  snapshot: Estimate;
  createdAt: string;
};

export type PriceCatalogEntry = {
  normalizedName: string;
  name: string;
  unit: string;
  category: EstimateItem["category"];
  region: string;
  averagePrice: number;
  medianPrice: number;
  minimumPrice: number;
  maximumPrice: number;
  latestPrice: number;
  sampleCount: number;
  latestObservedAt: string;
  confidence: number;
};

export type WorkflowDetail = {
  project: ConstructionProject;
  estimate: Estimate;
  revisions: EstimateRevision[];
  documents: ConstructionDocument[];
  progress: WorkProgressItem[];
};

export type WorkflowAction =
  | "save-version"
  | "approve"
  | "send-client"
  | "generate-proposal"
  | "generate-invoice"
  | "generate-contract"
  | "sign-contract"
  | "start-work"
  | "complete-work"
  | "generate-act"
  | "generate-ks2"
  | "generate-ks3"
  | "close-project";

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
  workflow: ["brief", "technology-card", "price-research", "estimate", "construction-documents"];
  quickActions: ConstructionQuickAction[];
  supportedArtifacts: Array<"estimate" | "commercial-proposal" | "contract" | "ks-2" | "ks-3" | "invoice">;
};

export type AgentProviderKind = "openai-compatible" | "ollama" | "codex-app-server" | "http-agent";

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
  intent?: "greeting" | "estimate" | "construction" | "documents" | "general";
  workflow?: { projectId: string; status: ProjectStatus } | null;
  agent?: { id: string; name: string; type: AgentProviderKind; model: string | null };
};

export type EstimateListResponse = { estimates: Estimate[]; persistence: "sqlite" | "postgresql" };
export type AdminSessionStatus = { authenticated: boolean; bootstrapRequired: boolean };
export type AccountProfile = { name: string; email: string; organization: string; region: string; role: "super_admin"; updatedAt: string };
export type RegisteredUserRole = "owner" | "member";
export type RegisteredUserStatus = "active" | "locked" | "revoked";
export type RegisteredUser = { id: string; name: string; email: string; company: string; role: RegisteredUserRole; status: RegisteredUserStatus; createdAt: string; updatedAt: string };
export type UserSessionStatus = { authenticated: boolean; user: RegisteredUser | null };
export type UserRegistrationInput = { name: string; email: string; company: string; password: string };
export type UserLoginInput = { email: string; password: string };
export type SystemStatus = { ok: true; app: string; releaseSha: string; ui: string; activeAgent: AgentDescriptor | null; configuredAgents: number; adminAuthenticated: boolean; bootstrapRequired: boolean; profileConfigured: boolean; persistence: "server-encrypted-file" | "sqlite-artifact-store" };
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };
export type ClientManifest = { productName: string; organizationName: string; assistantName: string; enabledViews: AppView[] };
