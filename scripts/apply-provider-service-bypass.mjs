import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/agent/route.ts";
let source = await readFile(path, "utf8");

const functionBefore = `async function runDomainPipeline(input: {\n  prompt: string;\n  body: Record<string, unknown>;\n  prepared: PreparedProviderRun;\n  signal: AbortSignal;\n}) {\n  const service = runServiceCommand(input.prompt);\n  if (service) {\n    return {\n      result: service,`;
const functionAfter = `async function runDomainPipeline(input: {\n  prompt: string;\n  body: Record<string, unknown>;\n  prepared: PreparedProviderRun;\n  signal: AbortSignal;\n  service: RulesRun | null;\n}) {\n  if (input.service) {\n    return {\n      result: input.service,`;
if (!source.includes(functionBefore)) throw new Error("runDomainPipeline marker missing");
source = source.replace(functionBefore, functionAfter);

const identityBefore = `  const prompt = latestUserText(body);\n  const identity = resolveServerIdentity(request);\n\n  let prepared: PreparedProviderRun;\n  try {\n    prepared = await prepareProviderRun(identity.ownerId);`;
const identityAfter = `  const prompt = latestUserText(body);\n  const identity = resolveServerIdentity(request);\n  const service = runServiceCommand(prompt);\n  const servicePrepared: PreparedProviderRun = {\n    connection: {\n      id: "provider:prosmet-services",\n      kind: "rules",\n      name: "Подкапотные сервисы Просметчика",\n      baseUrl: "",\n      model: "prosmet-service-command-v1",\n      status: "connected",\n      selected: true,\n      hasSecret: false,\n      lastError: null,\n      lastCheckedAt: null,\n      updatedAt: new Date().toISOString(),\n      apiKey: ""\n    },\n    descriptor: {\n      id: "provider:prosmet-services",\n      kind: "rules",\n      name: "Подкапотные сервисы Просметчика",\n      model: "prosmet-service-command-v1"\n    }\n  };\n\n  let prepared: PreparedProviderRun;\n  try {\n    // Provider settings and service recovery must stay reachable even when a\n    // previously selected external provider is unavailable. Estimation runs\n    // never fall back silently: only explicit service commands use this local path.\n    prepared = service ? servicePrepared : await prepareProviderRun(identity.ownerId);`;
if (!source.includes(identityBefore)) throw new Error("provider preparation marker missing");
source = source.replace(identityBefore, identityAfter);

const callBefore = `        const execution = await runDomainPipeline({\n          prompt,\n          body,\n          prepared,\n          signal: request.signal\n        });`;
const callAfter = `        const execution = await runDomainPipeline({\n          prompt,\n          body,\n          prepared,\n          signal: request.signal,\n          service\n        });`;
if (!source.includes(callBefore)) throw new Error("domain pipeline call marker missing");
source = source.replace(callBefore, callAfter);

await writeFile(path, source, "utf8");
console.log("Provider recovery path applied");
