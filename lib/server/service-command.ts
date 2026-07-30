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
  // OpenAI API remains an OpenAI-compatible HTTP provider even when the user
  // mentions Codex as the intended model or workflow. Codex CLI is selected
  // only when the local CLI / ChatGPT-authenticated runtime is requested.
  if (/openai|api.*codex|codex.*api|кодекс.*api|api.*кодекс/.test(value)) {
    return "openai-compatible";
  }
  if (
    /codex\s*cli|кодекс\s*cli|codex.*(?:chatgpt|чатгпт|primary|терминал|локальн)|(?:chatgpt|чатгпт|primary|терминал|локальн).*codex/.test(
      value
    )
  ) {
    return "codex-cli";
  }
  if (/codex|кодекс/.test(value)) return "codex-cli";
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

function developerFocus(value: string) {
  if (/react native|expo|ios|android|мобильн/.test(value)) return "React Native и мобильный сценарий замерщика";
  if (/смет|редактор|карточк|sheet|интерфейс|ui|ux/.test(value)) return "редактор сметы и рабочая область desktop/mobile";
  if (/backend|бэкенд|postgres|api|синхрон/.test(value)) return "backend, PostgreSQL и синхронизация";
  if (/deploy|депло|релиз|ci|runner|3200/.test(value)) return "CI/CD и проверяемый выпуск на port 3200";
  return "продолжение разработки и поддержание Просметчика в рабочем состоянии";
}

function developerTool(input: string): RulesRun {
  return {
    text:
      "Открыл режим разработчика Просметчика. A2A-координатор формирует проверяемые задачи для команды ИИ-разработчиков; чтение и планирование доступны сразу, а изменение кода, Git и production-деплой проходят только через явное подтверждение владельца и релизные проверки.",
    tools: [
      {
        name: "developer_workspace",
        args: {
          focus: developerFocus(input),
          protocol: "A2A 0.3.0",
          permissionMode: "owner-approved"
        }
      }
    ],
    state: {
      developerWorkspace: {
        status: "ready",
        protocol: "A2A 0.3.0",
        permissionMode: "owner-approved",
        executionPolicy: "plan-first-fail-closed"
      }
    },
    steps: ["load-developer-workspace"]
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
    /(?:режим|workspace|пространств).*(?:разработчик|development)|(?:команд|агент).*(?:ии|ai).*(?:разработ|код)|(?:a2a|а2а).*(?:агент|разработ|команд)|(?:разрабатывай|дорабатывай|поддерживай).*(?:приложен|проект)/.test(
      value
    )
  ) {
    return developerTool(value);
  }

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
