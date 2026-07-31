import { useEffect, useMemo, useState } from "react";
import type { AgentCatalog } from "@prosmet/contracts";
import { BotIcon, Settings2Icon } from "lucide-react";
import {
  agentSelectionEvent,
  loadAgentCatalog,
  readSelectedAgentId,
  selectAgent
} from "./agent-client";

export function AgentSelector({ onConfigure }: { onConfigure: () => void }) {
  const [catalog, setCatalog] = useState<AgentCatalog | null>(null);
  const [selectedId, setSelectedId] = useState(readSelectedAgentId);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await loadAgentCatalog();
        if (!active) return;
        setCatalog(next);
        setError("");
        const current = readSelectedAgentId();
        const valid = next.agents.some((agent) => agent.id === current);
        const resolved = valid ? current : next.defaultAgentId || next.agents[0]?.id || "";
        setSelectedId(resolved);
        if (resolved !== current) selectAgent(resolved);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить агентов");
      }
    };
    void refresh();
    const onSelection = (event: Event) => setSelectedId(String((event as CustomEvent).detail || ""));
    window.addEventListener(agentSelectionEvent, onSelection);
    return () => {
      active = false;
      window.removeEventListener(agentSelectionEvent, onSelection);
    };
  }, []);

  const selected = useMemo(
    () => catalog?.agents.find((agent) => agent.id === selectedId) || null,
    [catalog, selectedId]
  );

  if (error) {
    return (
      <button type="button" className="agent-selector-error" onClick={onConfigure} title={error}>
        <BotIcon /><span>Агент недоступен</span><Settings2Icon />
      </button>
    );
  }

  if (!catalog?.agents.length) {
    return (
      <button type="button" className="agent-selector-empty" onClick={onConfigure}>
        <BotIcon /><span>Подключить агента</span>
      </button>
    );
  }

  return (
    <label className="agent-selector" title={selected ? `${selected.kind}${selected.model ? ` · ${selected.model}` : ""}` : "Агент"}>
      <BotIcon />
      <select
        aria-label="Активный агент"
        value={selectedId}
        onChange={(event) => {
          const id = event.target.value;
          setSelectedId(id);
          selectAgent(id);
        }}
      >
        {catalog.agents.map((agent) => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      <button type="button" aria-label="Настроить агентов" onClick={onConfigure}><Settings2Icon /></button>
    </label>
  );
}
