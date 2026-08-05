const errorResponseRefs = Object.fromEntries(
  ["400", "401", "403", "404", "409", "429", "500"].map((status) => [
    status,
    { $ref: `#/components/responses/${({
      400: "BadRequest",
      401: "Unauthorized",
      403: "Forbidden",
      404: "NotFound",
      409: "Conflict",
      429: "RateLimited",
      500: "ServerError"
    })[status]}` }
  ])
);

const pathParameter = (name) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" }
});

const operation = ({
  operationId,
  tag,
  summary,
  scope = "public",
  response = { type: "object", additionalProperties: true },
  success = "200",
  requestBody,
  parameters = [],
  aliases
}) => ({
  operationId,
  tags: [tag],
  summary,
  "x-prosmet-scope": scope,
  ...(aliases ? { "x-prosmet-aliases": aliases } : {}),
  security: scope === "admin"
    ? [{ adminCookie: [] }, { adminToken: [] }]
    : scope === "user"
      ? [{ userCookie: [] }]
      : [],
  ...(parameters.length ? { parameters } : {}),
  ...(requestBody ? {
    requestBody: {
      required: true,
      content: { "application/json": { schema: requestBody } }
    }
  } : {}),
  responses: {
    [success]: {
      description: "Успешный ответ",
      content: { "application/json": { schema: response } }
    },
    ...errorResponseRefs
  }
});

export const routeInventory = [
  ["GET", "/api/openapi.json", "public", ['url.pathname === "/api/openapi.json"', 'request.method === "GET"']],
  ["GET", "/api/health", "public", ['url.pathname === "/api/health"', 'request.method === "GET"']],
  ["GET", "/api/system", "public", ['url.pathname === "/api/system"', 'request.method === "GET"']],
  ["GET", "/api/capabilities", "public", ['url.pathname === "/api/capabilities"', 'request.method === "GET"']],
  ["GET", "/api/admin/session", "public", ['url.pathname === "/api/admin/session"', 'request.method === "GET"']],
  ["POST", "/api/admin/session", "public", ['url.pathname === "/api/admin/session"', 'request.method === "POST"']],
  ["DELETE", "/api/admin/session", "admin", ['url.pathname === "/api/admin/session"', 'request.method === "DELETE"']],
  ["GET", "/api/account", "admin", ['url.pathname === "/api/account"', 'request.method === "GET"']],
  ["PUT", "/api/account", "admin", ['url.pathname === "/api/account"', 'request.method === "PUT"']],
  ["POST", "/api/leads", "public", ['url.pathname === "/api/leads"', 'request.method === "POST"']],
  ["GET", "/api/leads", "admin", ['url.pathname === "/api/leads"', 'request.method === "GET"']],
  ["DELETE", "/api/leads/{leadId}", "admin", ["leadRoute", 'request.method === "DELETE"']],
  ["POST", "/api/register", "public", ['url.pathname === "/api/register"', 'request.method !== "POST"']],
  ["GET", "/api/auth/session", "public", ['url.pathname === "/api/auth/session"', 'request.method === "GET"']],
  ["POST", "/api/auth/login", "public", ['url.pathname === "/api/auth/login"', 'request.method === "POST"']],
  ["DELETE", "/api/auth/logout", "user", ['url.pathname === "/api/auth/logout"', 'request.method === "DELETE"']],
  ["GET", "/api/users", "admin", ['url.pathname === "/api/users"', 'request.method === "GET"']],
  ["DELETE", "/api/users/{userId}", "admin", ["registeredUserRoute", 'request.method === "DELETE"']],
  ["GET", "/api/estimates", "public", ['url.pathname === "/api/estimates"', 'request.method === "GET"']],
  ["GET", "/api/estimates/{estimateId}", "public", ["estimateRoute", 'request.method === "GET"']],
  ["PUT", "/api/estimates/{estimateId}", "public", ["estimateRoute", 'request.method === "PUT"']],
  ["GET", "/api/provisioning/qwen/public-key", "public", ['url.pathname === "/api/provisioning/qwen/public-key"', 'request.method === "GET"']],
  ["POST", "/api/provisioning/qwen/complete", "admin", ['url.pathname === "/api/provisioning/qwen/complete"', 'request.method === "POST"']],
  ["GET", "/api/workflows/projects", "public", ['url.pathname === "/api/workflows/projects"', 'request.method === "GET"']],
  ["GET", "/api/workflows/projects/{projectId}", "public", ["projectWorkflowRoute", 'request.method === "GET"']],
  ["PUT", "/api/workflows/projects/{projectId}/progress/{itemId}", "public", ["projectProgressRoute", 'request.method === "PUT"']],
  ["GET", "/api/workflows/estimates/{estimateId}", "public", ["estimateWorkflowRoute", 'request.method === "GET"']],
  ["POST", "/api/workflows/estimates/{estimateId}/actions", "public", ["estimateActionRoute", 'request.method === "POST"']],
  ["GET", "/api/workflows/documents", "public", ['url.pathname === "/api/workflows/documents"', 'request.method === "GET"']],
  ["GET", "/api/workflows/documents/{documentId}", "public", ["documentRoute", 'request.method === "GET"']],
  ["PUT", "/api/workflows/documents/{documentId}", "public", ["documentRoute", 'request.method === "PUT"']],
  ["POST", "/api/workflows/documents/{documentId}/actions", "public", ["documentActionRoute", 'request.method === "POST"']],
  ["GET", "/api/workflows/prices", "public", ['url.pathname === "/api/workflows/prices"', 'request.method === "GET"']],
  ["GET", "/api/agents", "public", ['url.pathname === "/api/agents"', 'request.method === "GET"']],
  ["POST", "/api/agents", "admin", ['url.pathname === "/api/agents"', 'request.method === "POST"']],
  ["PUT", "/api/agents/{agentId}", "admin", ["agentRoute", 'request.method === "PUT"']],
  ["DELETE", "/api/agents/{agentId}", "admin", ["agentRoute", 'request.method === "DELETE"']],
  ["POST", "/api/agents/{agentId}/activate", "admin", ['action === "activate"', 'request.method === "POST"']],
  ["POST", "/api/agents/{agentId}/test", "admin", ['action === "test"', 'request.method === "POST"']],
  ["POST", "/api/agent", "public", ['url.pathname === "/api/agent"', 'request.method === "POST"']]
].map(([method, path, scope, serverNeedles]) => ({ method, path, scope, serverNeedles }));

const schemas = {
  ApiError: {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", examples: ["ESTIMATE_NOT_FOUND"] },
          message: { type: "string", examples: ["Смета не найдена."] },
          details: {}
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  },
  Health: {
    type: "object",
    required: ["ok", "app", "releaseSha", "runtime", "ui", "workflowSchema"],
    properties: {
      ok: { const: true },
      app: { type: "string" },
      releaseSha: { type: "string" },
      runtime: { type: "string" },
      ui: { type: "string" },
      workflowSchema: { type: "string" }
    }
  },
  AdminSession: {
    type: "object",
    required: ["authenticated", "bootstrapRequired"],
    properties: {
      authenticated: { type: "boolean" },
      bootstrapRequired: { type: "boolean" }
    },
    additionalProperties: false
  },
  RegisteredUser: {
    type: "object",
    required: ["id", "name", "email", "company", "role", "status", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      email: { type: "string", format: "email" },
      company: { type: "string" },
      role: { type: "string", enum: ["owner", "member"] },
      status: { type: "string", enum: ["active", "locked", "revoked"] },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" }
    },
    additionalProperties: false
  },
  UserSession: {
    type: "object",
    required: ["authenticated", "user"],
    properties: {
      authenticated: { type: "boolean" },
      user: {
        oneOf: [
          { $ref: "#/components/schemas/RegisteredUser" },
          { type: "null" }
        ]
      }
    }
  },
  RegisterRequest: {
    type: "object",
    required: ["name", "email", "company", "password"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 160 },
      email: { type: "string", format: "email", maxLength: 320 },
      company: { type: "string", minLength: 1, maxLength: 220 },
      password: { type: "string", minLength: 8, maxLength: 160, writeOnly: true }
    },
    additionalProperties: false
  },
  LoginRequest: {
    type: "object",
    required: ["email", "password"],
    properties: {
      email: { type: "string", format: "email" },
      password: { type: "string", writeOnly: true }
    },
    additionalProperties: false
  },
  AgentDescriptor: {
    type: "object",
    required: ["id", "name", "type", "enabled", "active", "hasSecret"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: {
        type: "string",
        enum: ["openai-compatible", "ollama", "codex-app-server", "http-agent"]
      },
      enabled: { type: "boolean" },
      active: { type: "boolean" },
      model: { type: ["string", "null"] },
      baseUrl: { type: ["string", "null"], format: "uri" },
      command: { type: ["string", "null"] },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: ["string", "null"] },
      systemPrompt: { type: ["string", "null"] },
      timeoutMs: { type: "integer", minimum: 5000, maximum: 600000 },
      hasSecret: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" }
    },
    additionalProperties: true
  },
  EstimateItem: {
    type: "object",
    required: ["id", "name", "unit", "quantity", "unitPrice", "category"],
    properties: {
      id: { type: "string" },
      name: { type: "string", minLength: 1 },
      unit: { type: "string", minLength: 1 },
      quantity: { type: "number", minimum: 0 },
      unitPrice: { type: "number", minimum: 0 },
      category: {
        type: "string",
        enum: ["work", "material", "equipment", "logistics"]
      }
    },
    additionalProperties: false
  },
  EstimateSection: {
    type: "object",
    required: ["id", "title", "items"],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      items: {
        type: "array",
        items: { $ref: "#/components/schemas/EstimateItem" }
      }
    }
  },
  Estimate: {
    type: "object",
    required: [
      "id", "title", "project", "customer", "region", "revision", "status",
      "overheadPercent", "profitPercent", "vatPercent", "sections", "updatedAt"
    ],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      project: { type: "string" },
      customer: { type: "string" },
      region: { type: "string" },
      revision: { type: "integer", minimum: 1 },
      status: { type: "string", enum: ["draft", "review", "approved", "sent"] },
      overheadPercent: { type: "number", minimum: 0 },
      profitPercent: { type: "number", minimum: 0 },
      vatPercent: { type: "number", minimum: 0 },
      sections: {
        type: "array",
        items: { $ref: "#/components/schemas/EstimateSection" }
      },
      updatedAt: { type: "string", format: "date-time" },
      persistence: { type: "object", additionalProperties: true },
      workflowProjectId: { type: "string" }
    }
  },
  EstimateList: {
    type: "object",
    required: ["estimates", "persistence"],
    properties: {
      estimates: {
        type: "array",
        items: { $ref: "#/components/schemas/Estimate" }
      },
      persistence: { type: "string", enum: ["sqlite", "postgresql"] }
    }
  },
  ConstructionProject: {
    type: "object",
    required: [
      "id", "title", "customer", "region", "status", "activeEstimateId",
      "createdAt", "updatedAt", "totals", "progress"
    ],
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      customer: { type: "string" },
      region: { type: "string" },
      status: { type: "string" },
      activeEstimateId: { type: "string" },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
      totals: { type: "object", additionalProperties: { type: "number" } },
      progress: { type: "object", additionalProperties: true }
    }
  },
  ConstructionDocument: {
    type: "object",
    required: [
      "id", "projectId", "estimateId", "type", "status", "number",
      "title", "content", "createdAt", "updatedAt"
    ],
    properties: {
      id: { type: "string" },
      projectId: { type: "string" },
      estimateId: { type: "string" },
      type: {
        type: "string",
        enum: ["commercial-proposal", "invoice", "contract", "act", "ks-2", "ks-3"]
      },
      status: {
        type: "string",
        enum: ["draft", "ready", "sent", "signed", "approved"]
      },
      number: { type: "string" },
      title: { type: "string" },
      content: { type: "object", additionalProperties: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" }
    }
  },
  WorkflowDetail: {
    type: "object",
    required: ["project", "estimate", "revisions", "documents", "progress"],
    properties: {
      project: { $ref: "#/components/schemas/ConstructionProject" },
      estimate: { $ref: "#/components/schemas/Estimate" },
      revisions: { type: "array", items: { type: "object", additionalProperties: true } },
      documents: {
        type: "array",
        items: { $ref: "#/components/schemas/ConstructionDocument" }
      },
      progress: { type: "array", items: { type: "object", additionalProperties: true } }
    }
  },
  PriceCatalogEntry: {
    type: "object",
    additionalProperties: true,
    required: [
      "normalizedName", "name", "unit", "category", "region", "averagePrice",
      "medianPrice", "minimumPrice", "maximumPrice", "latestPrice",
      "sampleCount", "latestObservedAt", "confidence"
    ]
  },
  AgentResponse: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      artifact: {
        oneOf: [
          { type: "object", additionalProperties: true },
          { type: "null" }
        ]
      },
      intent: { type: "string" },
      workflow: {
        oneOf: [
          { type: "object", additionalProperties: true },
          { type: "null" }
        ]
      },
      agent: {
        oneOf: [
          { type: "object", additionalProperties: true },
          { type: "null" }
        ]
      }
    }
  },
  DeleteResult: {
    type: "object",
    required: ["deleted"],
    properties: {
      deleted: { const: true },
      id: { type: "string" }
    }
  }
};

const paths = {
  "/api/openapi.json": {
    get: operation({
      operationId: "getOpenApi",
      tag: "System",
      summary: "Получить OpenAPI 3.1 контракт"
    })
  },
  "/api/health": {
    get: operation({
      operationId: "getHealth",
      tag: "System",
      summary: "Проверить здоровье и exact release SHA",
      response: { $ref: "#/components/schemas/Health" }
    })
  },
  "/api/system": {
    get: operation({
      operationId: "getSystem",
      tag: "System",
      summary: "Получить состояние системы без секретов"
    })
  },
  "/api/capabilities": {
    get: operation({
      operationId: "getCapabilities",
      tag: "System",
      summary: "Получить capability manifest"
    })
  },
  "/api/admin/session": {
    get: operation({
      operationId: "getAdminSession",
      tag: "Admin",
      summary: "Проверить admin session",
      response: { $ref: "#/components/schemas/AdminSession" }
    }),
    post: operation({
      operationId: "createAdminSession",
      tag: "Admin",
      summary: "Создать admin session",
      response: { $ref: "#/components/schemas/AdminSession" },
      requestBody: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string", writeOnly: true } }
      }
    }),
    delete: operation({
      operationId: "deleteAdminSession",
      tag: "Admin",
      summary: "Завершить admin session",
      scope: "admin",
      response: { $ref: "#/components/schemas/AdminSession" }
    })
  },
  "/api/account": {
    get: operation({
      operationId: "getAdminAccount",
      tag: "Admin",
      summary: "Получить профиль владельца",
      scope: "admin"
    }),
    put: operation({
      operationId: "updateAdminAccount",
      tag: "Admin",
      summary: "Обновить профиль владельца",
      scope: "admin",
      requestBody: { type: "object", additionalProperties: true }
    })
  },
  "/api/leads": {
    post: operation({
      operationId: "createLead",
      tag: "Leads",
      summary: "Создать корпоративную заявку",
      success: "201",
      requestBody: {
        type: "object",
        required: ["name", "contact", "company"],
        properties: {
          name: { type: "string" },
          contact: { type: "string" },
          company: { type: "string" },
          source: { type: "string" },
          website: { type: "string" }
        }
      }
    }),
    get: operation({
      operationId: "listLeads",
      tag: "Leads",
      summary: "Получить список заявок",
      scope: "admin",
      parameters: [{ $ref: "#/components/parameters/Limit" }]
    })
  },
  "/api/leads/{leadId}": {
    delete: operation({
      operationId: "deleteLead",
      tag: "Leads",
      summary: "Удалить заявку",
      scope: "admin",
      response: { $ref: "#/components/schemas/DeleteResult" },
      parameters: [pathParameter("leadId")]
    })
  },
  "/api/register": {
    post: operation({
      operationId: "registerUser",
      tag: "Auth",
      summary: "Зарегистрировать пользователя и создать session",
      success: "201",
      response: { $ref: "#/components/schemas/UserSession" },
      requestBody: { $ref: "#/components/schemas/RegisterRequest" },
      aliases: ["/api/users/register"]
    })
  },
  "/api/auth/session": {
    get: operation({
      operationId: "getUserSession",
      tag: "Auth",
      summary: "Восстановить пользовательскую session",
      response: { $ref: "#/components/schemas/UserSession" }
    })
  },
  "/api/auth/login": {
    post: operation({
      operationId: "loginUser",
      tag: "Auth",
      summary: "Войти в аккаунт",
      response: { $ref: "#/components/schemas/UserSession" },
      requestBody: { $ref: "#/components/schemas/LoginRequest" }
    })
  },
  "/api/auth/logout": {
    delete: operation({
      operationId: "logoutUser",
      tag: "Auth",
      summary: "Завершить пользовательскую session",
      scope: "user",
      response: { $ref: "#/components/schemas/UserSession" }
    })
  },
  "/api/users": {
    get: operation({
      operationId: "listUsers",
      tag: "Admin",
      summary: "Получить список пользователей",
      scope: "admin",
      parameters: [{ $ref: "#/components/parameters/Limit" }]
    })
  },
  "/api/users/{userId}": {
    delete: operation({
      operationId: "deleteUser",
      tag: "Admin",
      summary: "Удалить пользователя",
      scope: "admin",
      response: { $ref: "#/components/schemas/DeleteResult" },
      parameters: [pathParameter("userId")]
    })
  },
  "/api/estimates": {
    get: operation({
      operationId: "listEstimates",
      tag: "Estimates",
      summary: "Получить список смет legacy owner",
      response: { $ref: "#/components/schemas/EstimateList" }
    })
  },
  "/api/estimates/{estimateId}": {
    get: operation({
      operationId: "getEstimate",
      tag: "Estimates",
      summary: "Получить смету",
      response: { $ref: "#/components/schemas/Estimate" },
      parameters: [pathParameter("estimateId")]
    }),
    put: operation({
      operationId: "updateEstimate",
      tag: "Estimates",
      summary: "Обновить смету (legacy contract без revision precondition)",
      response: { $ref: "#/components/schemas/Estimate" },
      requestBody: { $ref: "#/components/schemas/Estimate" },
      parameters: [pathParameter("estimateId")]
    })
  },
  "/api/provisioning/qwen/public-key": {
    get: operation({
      operationId: "getQwenProvisioningKey",
      tag: "Agents",
      summary: "Получить одноразовый public key provisioning"
    })
  },
  "/api/provisioning/qwen/complete": {
    post: operation({
      operationId: "completeQwenProvisioning",
      tag: "Agents",
      summary: "Завершить Qwen provisioning",
      scope: "admin",
      requestBody: {
        type: "object",
        required: ["payload"],
        properties: { payload: { type: "string" } }
      }
    })
  },
  "/api/workflows/projects": {
    get: operation({
      operationId: "listProjects",
      tag: "Projects",
      summary: "Получить список проектов"
    })
  },
  "/api/workflows/projects/{projectId}": {
    get: operation({
      operationId: "getProjectWorkflow",
      tag: "Projects",
      summary: "Получить project workflow",
      response: { $ref: "#/components/schemas/WorkflowDetail" },
      parameters: [pathParameter("projectId")]
    })
  },
  "/api/workflows/projects/{projectId}/progress/{itemId}": {
    put: operation({
      operationId: "updateWorkProgress",
      tag: "Projects",
      summary: "Обновить фактический объём",
      requestBody: { type: "object", additionalProperties: true },
      parameters: [pathParameter("projectId"), pathParameter("itemId")]
    })
  },
  "/api/workflows/estimates/{estimateId}": {
    get: operation({
      operationId: "getEstimateWorkflow",
      tag: "Projects",
      summary: "Получить workflow сметы",
      response: { $ref: "#/components/schemas/WorkflowDetail" },
      parameters: [pathParameter("estimateId")]
    })
  },
  "/api/workflows/estimates/{estimateId}/actions": {
    post: operation({
      operationId: "runWorkflowAction",
      tag: "Projects",
      summary: "Выполнить lifecycle action",
      response: { $ref: "#/components/schemas/WorkflowDetail" },
      requestBody: {
        type: "object",
        required: ["action"],
        properties: { action: { type: "string" } }
      },
      parameters: [pathParameter("estimateId")]
    })
  },
  "/api/workflows/documents": {
    get: operation({
      operationId: "listDocuments",
      tag: "Documents",
      summary: "Получить список документов",
      parameters: [{
        name: "projectId",
        in: "query",
        required: false,
        schema: { type: "string" }
      }]
    })
  },
  "/api/workflows/documents/{documentId}": {
    get: operation({
      operationId: "getDocument",
      tag: "Documents",
      summary: "Получить документ",
      response: { $ref: "#/components/schemas/ConstructionDocument" },
      parameters: [pathParameter("documentId")]
    }),
    put: operation({
      operationId: "updateDocument",
      tag: "Documents",
      summary: "Обновить редактируемый документ",
      response: { $ref: "#/components/schemas/ConstructionDocument" },
      requestBody: {
        type: "object",
        properties: { content: { type: "object", additionalProperties: true } }
      },
      parameters: [pathParameter("documentId")]
    })
  },
  "/api/workflows/documents/{documentId}/actions": {
    post: operation({
      operationId: "updateDocumentStatus",
      tag: "Documents",
      summary: "Изменить статус документа",
      response: { $ref: "#/components/schemas/ConstructionDocument" },
      requestBody: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["send", "sign", "approve"] }
        }
      },
      parameters: [pathParameter("documentId")]
    })
  },
  "/api/workflows/prices": {
    get: operation({
      operationId: "listPrices",
      tag: "Prices",
      summary: "Получить региональный каталог цен",
      parameters: [
        { name: "query", in: "query", schema: { type: "string" } },
        { name: "region", in: "query", schema: { type: "string" } },
        { $ref: "#/components/parameters/Limit" }
      ]
    })
  },
  "/api/agents": {
    get: operation({
      operationId: "listAgents",
      tag: "Agents",
      summary: "Получить безопасный список агентов"
    }),
    post: operation({
      operationId: "createAgent",
      tag: "Agents",
      summary: "Создать агента",
      scope: "admin",
      success: "201",
      response: { $ref: "#/components/schemas/AgentDescriptor" },
      requestBody: { type: "object", additionalProperties: true }
    })
  },
  "/api/agents/{agentId}": {
    put: operation({
      operationId: "updateAgent",
      tag: "Agents",
      summary: "Обновить агента",
      scope: "admin",
      response: { $ref: "#/components/schemas/AgentDescriptor" },
      requestBody: { type: "object", additionalProperties: true },
      parameters: [pathParameter("agentId")]
    }),
    delete: operation({
      operationId: "deleteAgent",
      tag: "Agents",
      summary: "Удалить агента",
      scope: "admin",
      response: { $ref: "#/components/schemas/DeleteResult" },
      parameters: [pathParameter("agentId")]
    })
  },
  "/api/agents/{agentId}/activate": {
    post: operation({
      operationId: "activateAgent",
      tag: "Agents",
      summary: "Активировать агента",
      scope: "admin",
      response: { $ref: "#/components/schemas/AgentDescriptor" },
      parameters: [pathParameter("agentId")]
    })
  },
  "/api/agents/{agentId}/test": {
    post: operation({
      operationId: "testAgent",
      tag: "Agents",
      summary: "Проверить соединение агента",
      scope: "admin",
      parameters: [pathParameter("agentId")]
    })
  },
  "/api/agent": {
    post: operation({
      operationId: "runAgent",
      tag: "Chat",
      summary: "Выполнить AI-запрос и создать estimate artifact при необходимости",
      response: { $ref: "#/components/schemas/AgentResponse" },
      requestBody: {
        type: "object",
        required: ["messages"],
        properties: {
          messages: {
            type: "array",
            items: { type: "object", additionalProperties: true }
          },
          requestId: { type: "string" },
          region: { type: "string" }
        }
      }
    })
  }
};

export const openApiDocument = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "ProSmet API",
    version: "1.0.0",
    description: "Фактический HTTP API ProSmet. Public scope отражает текущий backward-compatible legacy contract и не означает завершённую tenant isolation.",
    license: { name: "Proprietary" }
  },
  servers: [
    { url: "https://kolibriai.online", description: "Production" },
    { url: "http://127.0.0.1:3200", description: "Local development" }
  ],
  tags: [
    "System", "Auth", "Admin", "Leads", "Chat",
    "Agents", "Estimates", "Projects", "Documents", "Prices"
  ].map((name) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      userCookie: {
        type: "apiKey",
        in: "cookie",
        name: "prosmet_user_session",
        description: "HttpOnly signed user session cookie."
      },
      adminCookie: {
        type: "apiKey",
        in: "cookie",
        name: "prosmet_admin_session",
        description: "HttpOnly super-admin session cookie."
      },
      adminToken: {
        type: "apiKey",
        in: "header",
        name: "x-prosmet-admin-token",
        description: "Server/admin automation token. Never return it to clients."
      }
    },
    parameters: {
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 500, default: 100 }
      }
    },
    schemas,
    responses: Object.fromEntries([
      ["BadRequest", "Некорректный запрос"],
      ["Unauthorized", "Аутентификация требуется или недействительна"],
      ["Forbidden", "Недостаточно прав"],
      ["NotFound", "Ресурс не найден"],
      ["Conflict", "Конфликт состояния, revision или workflow"],
      ["RateLimited", "Превышен лимит запросов"],
      ["ServerError", "Внутренняя или upstream ошибка"]
    ].map(([name, description]) => [
      name,
      {
        description,
        ...(name === "RateLimited" ? {
          headers: { "Retry-After": { schema: { type: "integer" } } }
        } : {}),
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" }
          }
        }
      }
    ]))
  },
  "x-prosmet-backward-compatibility": {
    policy: "Existing unversioned paths remain backward compatible. Breaking changes require a versioned path or a documented compatibility window with contract tests.",
    legacyOwner: "Estimate and workflow paths currently use legacy owner 'production'. Tenant isolation is tracked in a separate migration and must not be inferred from this contract."
  }
};
