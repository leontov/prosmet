import "server-only";

import type { RulesRun } from "@/lib/server/rules-agent";

function normalized(input: string) {
  return input
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function workspaceTool(section: "profile" | "estimating"): RulesRun {
  return {
    text:
      section === "profile"
        ? "Открыл профиль и организацию прямо в текущем чате. Данные сохраняются в tenant-scoped PostgreSQL и используются сервисами смет и документов."
        : "Открыл сметные настройки текущего рабочего пространства. Изменения применяются как значения по умолчанию для следующих расчётов.",
    tools: [
      {
        name: "workspace_settings",
        args: { section }
      }
    ],
    state: {
      workspaceService: {
        section,
        status: "requires-action"
      }
    },
    steps: ["load-workspace-service"]
  };
}

function providerHint(value: string) {
  if (/ollama|локальн.*модел/.test(value)) return "ollama";
  if (/mimo|ми ?мо/.test(value)) return "mimo";
  if (/openai|codex|кодекс/.test(value)) return "openai-compatible";
  return "mimo";
}

function providerTool(input: string): RulesRun {
  const hint = providerHint(input);
  return {
    text:
      "Открыл подключение AI-провайдеров внутри текущего чата. Секрет передаётся только backend, шифруется AES-256-GCM и никогда не возвращается в браузер или AG-UI события.",
    tools: [
      {
        name: "provider_settings",
        args: { providerHint: hint }
      }
    ],
    state: {
      provider: {
        requestedKind: hint,
        status: "requires-action"
      }
    },
    steps: ["load-provider-service"]
  };
}

function statusTool(): RulesRun {
  return {
    text:
      "Проверяю подкапотные сервисы текущего рабочего пространства: PostgreSQL, локальный кэш, синхронизацию и выбранный AI-провайдер.",
    tools: [
      {
        name: "service_status",
        args: { scope: "workspace" }
      }
    ],
    state: {
      services: { status: "checking" }
    },
    steps: ["check-services"]
  };
}

export function runServiceCommand(input: string): RulesRun | null {
  const value = normalized(input);
  if (!value) return null;

  if (
    /(?:настро|заполни|измени|открой).*(?:профил|организац|реквизит)|(?:профиль|организация|самозанят|индивидуальн.*предпринимател)/.test(
      value
    )
  ) {
    return workspaceTool("profile");
  }

  if (
    /(?:настро|измени|открой).*(?:регион|ндс|валют|метод.*расчет|сметн.*настрой)|сметные настройки/.test(
      value
    )
  ) {
    return workspaceTool("estimating");
  }

  if (
    /(?:ai|ии|искусственн.*интеллект).*(?:провайдер|модел|подключ)|подключ.*(?:mimo|ми ?мо|ollama|openai|codex|кодекс)|настрой.*(?:mimo|ми ?мо|ollama|openai|codex|кодекс)/.test(
      value
    )
  ) {
    return providerTool(value);
  }

  if (
    /(?:проверь|покажи|открой).*(?:сервис|backend|postgres|синхронизац)|статус сервисов/.test(
      value
    )
  ) {
    return statusTool();
  }

  return null;
}
