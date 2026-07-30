import "server-only";

export const A2A_PROTOCOL_VERSION = "0.3.0";
export const DEVELOPER_MODE_VERSION = "0.1.0";

export type DeveloperPermissionScope =
  | "read"
  | "propose"
  | "code"
  | "test"
  | "git"
  | "deploy";

export type DeveloperAgent = {
  id: string;
  name: string;
  role: string;
  description: string;
  skills: string[];
  permissionScopes: DeveloperPermissionScope[];
  status: "available" | "disabled";
};

export type DevelopmentPlan = {
  summary: string;
  selectedAgentIds: string[];
  stages: Array<{
    id: string;
    title: string;
    ownerAgentId: string;
    acceptance: string;
  }>;
  acceptanceCriteria: string[];
  requestedPermission: DeveloperPermissionScope;
  executionMode: "plan";
};

export const developerAgents: DeveloperAgent[] = [
  {
    id: "coordinator",
    name: "Kolibri Coordinator",
    role: "Управляющий разработкой",
    description:
      "Разбивает цель на завершённые релизные задачи, маршрутизирует их между агентами и принимает результат только после проверок.",
    skills: ["декомпозиция", "A2A-маршрутизация", "контроль критериев готовности"],
    permissionScopes: ["read", "propose"],
    status: "available"
  },
  {
    id: "product-architect",
    name: "Product Architect",
    role: "Архитектор продукта",
    description:
      "Сохраняет целостность продукта-конкурента 1С и ГРАНД-Сметы, проектирует пользовательские сценарии и доменную модель.",
    skills: ["продуктовая архитектура", "сметный домен", "документооборот"],
    permissionScopes: ["read", "propose"],
    status: "available"
  },
  {
    id: "frontend",
    name: "Frontend Engineer",
    role: "Web-интерфейс",
    description:
      "Развивает assistant-ui/AG-UI рабочую область, редакторы, адаптивность и доступность desktop/mobile web.",
    skills: ["Next.js", "React", "assistant-ui", "AG-UI", "доступность"],
    permissionScopes: ["read", "propose", "code", "test"],
    status: "available"
  },
  {
    id: "backend",
    name: "Backend Engineer",
    role: "Сервисы и данные",
    description:
      "Развивает API, PostgreSQL, локальную синхронизацию, документы, права доступа и интеграции поставщиков данных.",
    skills: ["Next.js API", "PostgreSQL", "Drizzle", "синхронизация", "tenant isolation"],
    permissionScopes: ["read", "propose", "code", "test"],
    status: "available"
  },
  {
    id: "mobile",
    name: "React Native Engineer",
    role: "Нативное мобильное приложение",
    description:
      "Проектирует и реализует мобильный клиент замерщика с общими контрактами, офлайн-кэшем и безопасной синхронизацией.",
    skills: ["React Native", "Expo", "offline-first", "mobile UX"],
    permissionScopes: ["read", "propose", "code", "test"],
    status: "available"
  },
  {
    id: "estimate-domain",
    name: "Estimate & Documents Expert",
    role: "Сметы и строительные документы",
    description:
      "Контролирует технологические карты, ресурсы, цены, версии смет, КП, договоры, акты, КС-2, КС-3 и М-29.",
    skills: ["сметы", "ценообразование", "строительная технология", "документы"],
    permissionScopes: ["read", "propose", "test"],
    status: "available"
  },
  {
    id: "qa",
    name: "QA Engineer",
    role: "Независимая проверка",
    description:
      "Проверяет критический пользовательский путь в Chromium desktop/mobile, регрессии, офлайн-восстановление и экспорт.",
    skills: ["Playwright", "Vitest", "E2E", "визуальная проверка", "регрессии"],
    permissionScopes: ["read", "propose", "test"],
    status: "available"
  },
  {
    id: "devops",
    name: "Release Engineer",
    role: "CI/CD и выпуск",
    description:
      "Ведёт immutable-релизы на prosmet-primary, наблюдаемость, откат и доказательства фактического деплоя.",
    skills: ["GitHub Actions", "Linux", "release gates", "deployment", "observability"],
    permissionScopes: ["read", "propose", "test", "git", "deploy"],
    status: "available"
  },
  {
    id: "security",
    name: "Security Engineer",
    role: "Безопасность и права",
    description:
      "Проверяет tenant isolation, секреты, A2A-доверие, разрешения разработчика и безопасные границы выполнения.",
    skills: ["threat modeling", "authorization", "secret isolation", "audit"],
    permissionScopes: ["read", "propose", "test"],
    status: "available"
  }
];

function normalized(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

export function selectDeveloperAgents(prompt: string) {
  const value = normalized(prompt);
  const selected = new Set<string>(["coordinator", "qa"]);

  if (/интерфейс|ui|ux|frontend|фронтенд|карточк|sheet|редактор|assistant-ui|ag-ui/.test(value)) {
    selected.add("frontend");
    selected.add("product-architect");
  }
  if (/backend|бэкенд|api|postgres|баз|синхрон|сервер|tenant/.test(value)) {
    selected.add("backend");
  }
  if (/mobile|мобильн|react native|expo|ios|android|замерщик/.test(value)) {
    selected.add("mobile");
    selected.add("product-architect");
  }
  if (/смет|цен|документ|договор|акт|кс-2|кс2|кс-3|кс3|м-29|м29/.test(value)) {
    selected.add("estimate-domain");
    selected.add("product-architect");
  }
  if (/a2a|агент|оркестр|команд.*ии|разработчик/.test(value)) {
    selected.add("backend");
    selected.add("security");
  }
  if (/deploy|депло|релиз|github|ci|cd|action|runner|порт 3200/.test(value)) {
    selected.add("devops");
    selected.add("security");
  }
  if (/безопас|прав|секрет|auth|изоляц/.test(value)) {
    selected.add("security");
  }

  if (selected.size === 2) {
    selected.add("product-architect");
    selected.add("frontend");
    selected.add("backend");
  }

  return developerAgents.filter((agent) => selected.has(agent.id));
}

function requestedPermission(prompt: string): DeveloperPermissionScope {
  const value = normalized(prompt);
  if (/deploy|депло|выпусти|релиз|production|продакшн/.test(value)) return "deploy";
  if (/commit|коммит|pull request|pr|merge|ветк|github/.test(value)) return "git";
  if (/исправ|реализ|разработ|добав|удал|перепиш|код/.test(value)) return "code";
  if (/проверь|тест|qa|аудит/.test(value)) return "test";
  return "propose";
}

export function buildDevelopmentPlan(prompt: string): DevelopmentPlan {
  const selected = selectDeveloperAgents(prompt);
  const permission = requestedPermission(prompt);
  const implementationOwner = selected.find((agent) =>
    ["frontend", "backend", "mobile", "estimate-domain"].includes(agent.id)
  )?.id ?? "product-architect";

  return {
    summary: prompt.trim().slice(0, 2_000) || "Развитие приложения Просметчик",
    selectedAgentIds: selected.map((agent) => agent.id),
    stages: [
      {
        id: "scope",
        title: "Зафиксировать пользовательский результат и критерии приёмки",
        ownerAgentId: "product-architect",
        acceptance: "Цель сформулирована как наблюдаемый сценарий, а не как набор внутренних изменений."
      },
      {
        id: "implementation",
        title: "Реализовать минимальный законченный вертикальный срез",
        ownerAgentId: implementationOwner,
        acceptance: "Изменение работает в реальном интерфейсе и сохраняет данные согласно контрактам продукта."
      },
      {
        id: "verification",
        title: "Проверить desktop, mobile, данные и отсутствие регрессий",
        ownerAgentId: "qa",
        acceptance: "Source contract, typecheck, unit, build и Chromium-проверки проходят."
      },
      {
        id: "release",
        title: "Выпустить проверенный immutable-релиз",
        ownerAgentId: "devops",
        acceptance: "Живой процесс подтверждает точный SHA, health и критический E2E после деплоя."
      }
    ],
    acceptanceCriteria: [
      "Изменение доступно владельцу через чат без обязательной внешней IDE.",
      "Служебная работа агентов не засоряет пользовательский интерфейс.",
      "Высокорисковые операции имеют явный owner approval и журнал аудита.",
      "Результат не считается готовым без фактической проверки и релизного доказательства."
    ],
    requestedPermission: permission,
    executionMode: "plan"
  };
}

export function publicDeveloperRegistry() {
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    modeVersion: DEVELOPER_MODE_VERSION,
    agents: developerAgents,
    permissions: {
      default: ["read", "propose"],
      ownerApprovable: ["code", "test", "git", "deploy"],
      writeRequiresApproval: true,
      secretsReturnedToBrowser: false,
      auditRequired: true
    }
  };
}

export function prosmetDeveloperAgentCard(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: "Просметчик — команда ИИ-разработчиков",
    description:
      "A2A-вход для планирования, координации и контролируемого развития Просметчика через чат владельца.",
    url: `${base}/api/a2a`,
    version: DEVELOPER_MODE_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "develop-prosmet",
        name: "Разработка и сопровождение Просметчика",
        description:
          "Формирует проверяемый план разработки, подбирает специализированных агентов и определяет необходимые разрешения.",
        tags: ["software-development", "estimating", "documents", "react-native", "qa", "release"],
        examples: [
          "Приведи редактор сметы в порядок и выпусти проверенную desktop/mobile версию.",
          "Спроектируй React Native приложение замерщика с офлайн-синхронизацией.",
          "Проверь CI, исправь блокеры и подготовь релиз на порт 3200."
        ]
      }
    ],
    supportsAuthenticatedExtendedCard: false
  };
}
