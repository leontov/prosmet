import { readFile, writeFile, rm } from "node:fs/promises";

async function text(path) {
  return readFile(path, "utf8");
}

async function save(path, value) {
  await writeFile(path, value, "utf8");
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing replacement anchor: ${label}`);
  return source.replace(from, to);
}

function replaceRegex(source, pattern, to, label) {
  if (!pattern.test(source)) throw new Error(`Missing regex anchor: ${label}`);
  return source.replace(pattern, to);
}

async function patchServer() {
  const path = "apps/web/server.mjs";
  let source = await text(path);

  source = replaceOnce(
    source,
    'import { createInterface } from "node:readline";\n',
    'import { createInterface } from "node:readline";\nimport { createEstimateStore } from "./server/estimate-store.mjs";\n',
    "server import"
  );

  source = replaceOnce(
    source,
    'const adminTokenFile = join(configRoot, "admin.token");\n',
    `const adminTokenFile = join(configRoot, "admin.token");
const estimateDatabaseFile = process.env.PROSMET_DATABASE_PATH || join(configRoot, "prosmet.sqlite");
const estimateStore = createEstimateStore(estimateDatabaseFile);
const capabilityManifest = {
  vertical: "construction-estimates-ru",
  workflow: ["brief", "technology-card", "price-research", "estimate", "construction-documents"],
  quickActions: [
    {
      id: "create-estimate",
      title: "Составить смету",
      prompt: "Составь строительную смету. Сначала уточни недостающие исходные данные, затем сформируй технологическую карту, исследуй актуальные цены и создай редактируемую смету.",
      artifactType: "estimate"
    },
    {
      id: "calculate-measurements",
      title: "Рассчитать по замерам",
      prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем создай смету с ценами, источниками и итогами.",
      artifactType: "estimate"
    },
    {
      id: "prepare-documents",
      title: "Подготовить документы",
      prompt: "На основании сметы подготовь комплект строительных документов: коммерческое предложение, договор, акт и счёт.",
      artifactType: "document-set"
    }
  ],
  supportedArtifacts: ["estimate", "commercial-proposal", "contract", "ks-2", "ks-3", "invoice"]
};
`,
    "server database constants"
  );

  source = replaceRegex(
    source,
    /const systemInstructions = \[[\s\S]*?\]\.join\(" "\);/,
    `const systemInstructions = [
  "Ты главный агент-сметчик универсального строительного приложения Просметчик.",
  "Отвечай только одним JSON-объектом с полями text, artifact и estimate.",
  "artifact должен быть null или строкой estimate.",
  "Когда пользователь просит смету, сначала проверь исходные данные и задай только необходимые уточняющие вопросы.",
  "До формирования сметы составь технологическую карту: этапы, подготовка, материалы, механизмы, контроль качества, охрана труда и условия выполнения.",
  "После технологической карты подбери актуальные цены для указанного региона, фиксируя в названиях и структуре сметы все необходимые работы, материалы, оборудование и логистику.",
  "Когда данных достаточно, верни полноценную редактируемую смету по переданной JSON-схеме; сервер сам сохранит её в базе данных и откроет редактор.",
  "Если критически важных данных недостаточно, не придумывай значения: задай конкретный вопрос в text, а artifact и estimate оставь null.",
  "Все количества, цены и проценты должны быть конечными неотрицательными числами.",
  "Не используй тестовые, демонстрационные или фиктивные объекты."
].join(" ");`,
    "server system instructions"
  );

  source = replaceOnce(
    source,
    '      persistence: "server-encrypted-file"\n',
    '      persistence: "sqlite-artifact-store"\n',
    "system persistence"
  );

  source = replaceOnce(
    source,
    '  if (request.method === "GET" && url.pathname === "/api/agents") {\n',
    `  if (request.method === "GET" && url.pathname === "/api/capabilities") {
    return sendJson(response, 200, capabilityManifest);
  }

  if (request.method === "GET" && url.pathname === "/api/estimates") {
    return sendJson(response, 200, {
      estimates: estimateStore.listEstimates("production"),
      persistence: "sqlite"
    });
  }

  const estimateRoute = url.pathname.match(/^\\/api\\/estimates\\/([^/]+)$/);
  if (estimateRoute) {
    const estimateId = decodeURIComponent(estimateRoute[1]);
    if (request.method === "GET") {
      const estimate = estimateStore.getEstimate(estimateId, "production");
      if (!estimate) return sendError(response, 404, "ESTIMATE_NOT_FOUND", "Смета не найдена.");
      return sendJson(response, 200, estimate);
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const estimate = validateEstimate(body.estimate ?? body);
      if (!estimate || estimate.id !== estimateId) {
        return sendError(response, 400, "INVALID_ESTIMATE", "Передана некорректная смета.");
      }
      const stored = estimateStore.saveEstimate(estimate, { ownerId: "production" });
      return sendJson(response, 200, stored);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
`,
    "estimate API routes"
  );

  source = replaceOnce(
    source,
    `    const result = await callConfiguredAgent(agent, body.messages, controller.signal);
    return sendJson(response, 200, {
      ...result,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        model: agent.model || null
      }
    });`,
    `    const requestId = optionalString(body.requestId, 160) || randomUUID();
    const result = await callConfiguredAgent(agent, body.messages, controller.signal);
    let artifact = null;
    if (result.artifact === "estimate" && result.estimate) {
      const stored = estimateStore.saveEstimate(result.estimate, {
        ownerId: "production",
        sourceAgentId: agent.id,
        sourceRequestId: requestId
      });
      artifact = {
        type: "estimate",
        id: stored.id,
        revision: stored.revision,
        database: "sqlite"
      };
    }
    return sendJson(response, 200, {
      text: artifact ? (result.text || "Смета сформирована и сохранена в базе данных.") : result.text,
      artifact,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        model: agent.model || null
      }
    });`,
    "database-first agent response"
  );

  source = replaceOnce(
    source,
    '    for (const { client } of codexClients.values()) client.close();\n    server.close(() => process.exit(0));\n',
    '    for (const { client } of codexClients.values()) client.close();\n    estimateStore.close();\n    server.close(() => process.exit(0));\n',
    "database close"
  );

  await save(path, source);
}

function remoteHydrationEffect() {
  return `
  useEffect(() => {
    let cancelled = false;
    void listStoredEstimates()
      .then(({ estimates }) => {
        if (cancelled || !estimates.length) return;
        setWorkspace((current) => {
          const localById = new Map(current.estimates.map((estimate) => [estimate.id, estimate]));
          for (const estimate of estimates) localById.set(estimate.id, estimate);
          const merged = [...localById.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
          const activeEstimateId = current.activeEstimateId && localById.has(current.activeEstimateId)
            ? current.activeEstimateId
            : merged[0]?.id ?? null;
          return { estimates: merged, activeEstimateId };
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
`;
}

async function patchWorkspace(path, importAnchor, importValue) {
  let source = await text(path);
  source = replaceOnce(source, importAnchor, `${importAnchor}${importValue}`, `${path}:import`);

  const persistenceEffect = `  useEffect(() => {
    window.localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    window.localStorage.removeItem(legacyEstimateKey);
  }, [workspace]);
`;
  source = replaceOnce(source, persistenceEffect, `${persistenceEffect}${remoteHydrationEffect()}`, `${path}:remote hydration`);

  source = replaceRegex(
    source,
    /  const updateActiveEstimate = useCallback\(\(incoming: Estimate\) => \{[\s\S]*?\n  \}, \[\]\);/,
    `  const updateActiveEstimate = useCallback((incoming: Estimate) => {
    setWorkspace((current) => ({
      ...current,
      estimates: current.estimates.some((estimate) => estimate.id === incoming.id)
        ? current.estimates.map((estimate) => estimate.id === incoming.id ? incoming : estimate)
        : [incoming, ...current.estimates],
      activeEstimateId: incoming.id
    }));
    void persistEstimate(incoming)
      .then((persisted) => {
        setWorkspace((current) => ({
          ...current,
          estimates: current.estimates.map((estimate) => estimate.id === persisted.id ? persisted : estimate),
          activeEstimateId: persisted.id
        }));
      })
      .catch((error) => console.error("Failed to persist estimate", error));
  }, []);`,
    `${path}:persist updates`
  );

  await save(path, source);
}

async function patchApps() {
  await patchWorkspace(
    "apps/web/src/app/App.tsx",
    'import { fetchSystemStatus } from "../features/agents/agent-api";\n',
    'import { listStoredEstimates, persistEstimate } from "../features/estimate/estimate-api";\n'
  );
  await patchWorkspace(
    "apps/web/src/app/ReferenceApp.tsx",
    'import { SettingsView } from "../features/settings/SettingsView";\n',
    'import { listStoredEstimates, persistEstimate } from "../features/estimate/estimate-api";\n'
  );

  const editorPath = "apps/web/src/features/estimate/EstimateEditor.tsx";
  let editor = await text(editorPath);
  editor = editor.replace("сохранено локально", "сохранено в базе данных");
  await save(editorPath, editor);

  const nativePath = "apps/mobile/src/screens/ChatScreen.tsx";
  let native = await text(nativePath);
  native = replaceRegex(
    native,
    /type QuickAction = \{[\s\S]*?const quickActions: QuickAction\[\] = \[[\s\S]*?\n\];/,
    `type QuickAction = {
  id: "estimate" | "measure" | "documents";
  title: string;
  prompt: string;
};

const quickActions: QuickAction[] = [
  {
    id: "estimate",
    title: "Составить смету",
    prompt: "Составь строительную смету. Уточни исходные данные, сформируй технологическую карту, исследуй цены и создай редактируемую смету."
  },
  {
    id: "measure",
    title: "Рассчитать по замерам",
    prompt: "Рассчитай объёмы работ и материалов по моим замерам, затем создай смету с ценами и итогами."
  },
  {
    id: "documents",
    title: "Подготовить документы",
    prompt: "На основании сметы подготовь коммерческое предложение, договор, акт и счёт."
  }
];`,
    "native construction actions"
  );
  native = replaceRegex(
    native,
    /function QuickActionGlyph\(\{ id \}: \{ id: QuickAction\["id"\] \}\) \{[\s\S]*?\n\}/,
    `function QuickActionGlyph({ id }: { id: QuickAction["id"] }) {
  if (id === "estimate") return <PenGlyph />;
  if (id === "measure") return <GlobeGlyph />;
  return <ImageGlyph />;
}`,
    "native glyph mapping"
  );
  native = native.replace("Спросить Просметчик...", "Опишите объект и замеры...");
  await save(nativePath, native);
}

async function patchWorkflows() {
  const deployPath = ".github/workflows/greenfield-deploy.yml";
  let deploy = await text(deployPath);
  deploy = replaceOnce(
    deploy,
    '          cp apps/web/server.mjs "$RELEASE_DIR/server.mjs"\n',
    '          cp apps/web/server.mjs "$RELEASE_DIR/server.mjs"\n          mkdir -p "$RELEASE_DIR/server"\n          cp -a apps/web/server/. "$RELEASE_DIR/server/"\n',
    "deploy server modules"
  );
  await save(deployPath, deploy);

  const recoveryPath = ".github/workflows/public-root-recovery.yml";
  let recovery = await text(recoveryPath);
  recovery = replaceOnce(
    recovery,
    '          cp apps/web/server.mjs "$RELEASE_INSTANCE/server.mjs"\n',
    '          cp apps/web/server.mjs "$RELEASE_INSTANCE/server.mjs"\n          mkdir -p "$RELEASE_INSTANCE/server"\n          cp -a apps/web/server/. "$RELEASE_INSTANCE/server/"\n',
    "recovery server modules"
  );
  await save(recoveryPath, recovery);
}

async function patchTestsAndContract() {
  const e2ePath = "apps/web/e2e/app.spec.ts";
  let e2e = await text(e2ePath);
  e2e = e2e.replace('name: "Что нужно сделать?"', 'name: "Что нужно рассчитать?"');
  e2e = e2e.replace('"Создать изображение"', '"Составить смету"');
  e2e = e2e.replace('"Напиши или отредактируй"', '"Рассчитать по замерам"');
  e2e = e2e.replace('"Искать в интернете"', '"Подготовить документы"');
  e2e = e2e.replace('"Спросить Chat..."', '"Опишите объект и замеры..."');
  e2e = e2e.replace('name: /Механизированная штукатурка/', 'name: /Составить смету/');
  e2e = replaceOnce(
    e2e,
    '  const editor = page.getByRole("dialog", { name: "Редактор сметы" });\n  await expect(editor).toBeVisible({ timeout: 30_000 });\n',
    `  const editor = page.getByRole("dialog", { name: "Редактор сметы" });
  await expect(editor).toBeVisible({ timeout: 30_000 });

  const storedResponse = await page.request.get("/api/estimates");
  expect(storedResponse.ok(), await storedResponse.text()).toBeTruthy();
  const stored = await storedResponse.json();
  expect(stored.persistence).toBe("sqlite");
  expect(stored.estimates.some((estimate: { title: string }) => estimate.title === "Механизированная штукатурка 358 м²")).toBeTruthy();
`,
    "database E2E assertion"
  );
  e2e = replaceOnce(
    e2e,
    '  await page.screenshot({ path: `artifacts-estimate-${testInfo.project.name}.png`, fullPage: true });\n  await page.reload({ waitUntil: "networkidle" });\n',
    '  await page.screenshot({ path: `artifacts-estimate-${testInfo.project.name}.png`, fullPage: true });\n  await page.evaluate(() => localStorage.removeItem("prosmet-workspace-v1"));\n  await page.reload({ waitUntil: "networkidle" });\n',
    "database reload proof"
  );
  await save(e2ePath, e2e);

  const contractPath = "scripts/greenfield-contract.mjs";
  let contract = await text(contractPath);
  contract = replaceOnce(
    contract,
    '  "apps/web/server.mjs",\n',
    '  "apps/web/server.mjs",\n  "apps/web/server/estimate-store.mjs",\n  "apps/web/src/features/estimate/estimate-api.ts",\n',
    "contract required database files"
  );
  contract = replaceOnce(
    contract,
    'if (server.includes("asksEstimate")) failures.push("server:legacy-fake-responder-present");\n',
    `if (server.includes("asksEstimate")) failures.push("server:legacy-fake-responder-present");
for (const token of ["createEstimateStore", "/api/estimates", "/api/capabilities", "estimateStore.saveEstimate", 'database: "sqlite"']) {
  if (!server.includes(token)) failures.push(\`server:database-first-contract-missing:\${token}\`);
}
`,
    "contract database-first checks"
  );
  contract = replaceOnce(
    contract,
    '  persistence: "server-encrypted-file" | "sqlite-artifact-store";\n',
    '  persistence: "server-encrypted-file" | "sqlite-artifact-store";\n',
    "noop guard"
  );
  await save(contractPath, contract);
}

await patchServer();
await patchApps();
await patchWorkflows();
await patchTestsAndContract();
await rm("scripts/apply-database-first-refactor.mjs", { force: true });
await rm(".github/workflows/apply-database-first-refactor.yml", { force: true });
console.log("Database-first refactor materialized.");
