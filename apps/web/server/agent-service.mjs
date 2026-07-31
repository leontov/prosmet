import {
  deleteStoredAgent,
  loadAgentConfig,
  publicAgent,
  setDefaultAgent,
  upsertStoredAgent
} from "./agent-config.mjs";
import { invokeAgentAdapter } from "./agent-adapters.mjs";

export class AgentServiceError extends Error {
  constructor(code, message, status = 500, details = null) {
    super(message);
    this.name = "AgentServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function publicSelection(agent, defaultAgentId) {
  return {
    id: agent.id,
    name: agent.name,
    kind: agent.kind,
    model: agent.model || "",
    enabled: agent.enabled,
    isDefault: agent.id === defaultAgentId
  };
}

export async function listPublicAgents() {
  const config = await loadAgentConfig();
  return {
    configured: config.agents.length > 0,
    defaultAgentId: config.defaultAgentId,
    agents: config.agents.filter((agent) => agent.enabled).map((agent) => publicSelection(agent, config.defaultAgentId))
  };
}

export async function listAdminAgents() {
  const config = await loadAgentConfig();
  return {
    defaultAgentId: config.defaultAgentId,
    agents: config.agents.map((agent) => ({ ...publicAgent(agent), isDefault: agent.id === config.defaultAgentId }))
  };
}

function selectAgent(config, requestedId) {
  if (requestedId) {
    const requested = config.agents.find((agent) => agent.id === requestedId);
    if (!requested) throw new AgentServiceError("agent_not_found", `Agent ${requestedId} is not configured`, 404);
    if (!requested.enabled) throw new AgentServiceError("agent_disabled", `Agent ${requestedId} is disabled`, 409);
    return requested;
  }

  const selected = config.agents.find((agent) => agent.id === config.defaultAgentId && agent.enabled)
    || config.agents.find((agent) => agent.enabled);
  if (!selected) {
    throw new AgentServiceError(
      "agent_not_configured",
      "No agent is configured. A super-administrator must connect Codex, an OpenAI-compatible endpoint, Ollama, AG-UI, or A2A in Settings.",
      503
    );
  }
  return selected;
}

export async function invokeConfiguredAgent({ agentId = "", messages, signal }) {
  const config = await loadAgentConfig();
  const agent = selectAgent(config, agentId);
  const startedAt = Date.now();

  try {
    const response = await invokeAgentAdapter(agent, messages, signal);
    return {
      ...response,
      provider: publicSelection(agent, config.defaultAgentId),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) throw error;
    throw new AgentServiceError(
      "agent_invocation_failed",
      error instanceof Error ? error.message : "Agent invocation failed",
      502,
      { agentId: agent.id, kind: agent.kind }
    );
  }
}

export async function saveAgent(input) {
  try {
    const result = await upsertStoredAgent(input);
    return {
      agent: { ...publicAgent(result.agent), isDefault: result.defaultAgentId === result.agent.id },
      defaultAgentId: result.defaultAgentId
    };
  } catch (error) {
    throw new AgentServiceError("invalid_agent_configuration", error instanceof Error ? error.message : "Invalid agent configuration", 400);
  }
}

export async function removeAgent(id) {
  try {
    return await deleteStoredAgent(id);
  } catch (error) {
    throw new AgentServiceError("agent_delete_failed", error instanceof Error ? error.message : "Agent deletion failed", 400);
  }
}

export async function activateAgent(id) {
  try {
    return { defaultAgentId: await setDefaultAgent(id) };
  } catch (error) {
    throw new AgentServiceError("agent_activation_failed", error instanceof Error ? error.message : "Agent activation failed", 400);
  }
}

export async function testAgent(id, signal) {
  const result = await invokeConfiguredAgent({
    agentId: id,
    signal,
    messages: [{ role: "user", content: "Ответь ровно одной строкой: PROSMET_AGENT_OK" }]
  });
  return {
    ok: /PROSMET_AGENT_OK/i.test(result.text),
    text: result.text,
    provider: result.provider,
    latencyMs: result.latencyMs
  };
}
