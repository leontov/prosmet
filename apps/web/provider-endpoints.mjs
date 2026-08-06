const MIMO_PAYG_HOST = "api.xiaomimimo.com";
const MIMO_TOKEN_PLAN_HOST = /^token-plan-(cn|sgp|ams)\.xiaomimimo\.com$/;

export const MIMO_RECOMMENDED_MODEL = "mimo-v2.5-pro";

export function isMiMoApiUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    return host === MIMO_PAYG_HOST || MIMO_TOKEN_PLAN_HOST.test(host);
  } catch {
    return false;
  }
}

export function isMiMoConsoleOrDocsUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "platform.xiaomimimo.com" || host === "mimo.mi.com" || host === "mimo.xiaomi.com";
  } catch {
    return false;
  }
}

export function isLegacyMiMoModel(value) {
  const model = String(value || "").trim().toLowerCase();
  return /^mimo-v2(?:-|$)/.test(model) && !/^mimo-v2\.5(?:-|$)/.test(model);
}

export function normalizeOpenAIBaseUrl(value) {
  const url = new URL(String(value || "").trim());
  url.search = "";
  url.hash = "";

  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/chat/completions")) {
    path = path.slice(0, -"/chat/completions".length) || "/";
  }

  if (isMiMoApiUrl(url.toString())) {
    if (path === "" || path === "/") path = "/v1";
    if (path !== "/v1") {
      throw new Error("Для Xiaomi MiMo укажите Base URL, заканчивающийся на /v1, либо полный /v1/chat/completions.");
    }
  }

  url.pathname = path || "/";
  return url.toString().replace(/\/+$/, "");
}

export function openAIChatCompletionsUrl(value) {
  const raw = String(value || "").trim();
  const url = new URL(raw);
  url.search = "";
  url.hash = "";
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/chat/completions")) {
    url.pathname = path;
    return url.toString();
  }

  const base = normalizeOpenAIBaseUrl(raw);
  return `${base}/chat/completions`;
}

export function recommendedMiMoBaseUrl({ tokenPlan = false, region = "sgp" } = {}) {
  if (!tokenPlan) return "https://api.xiaomimimo.com/v1";
  if (!new Set(["cn", "sgp", "ams"]).has(region)) throw new Error("Unsupported MiMo Token Plan region");
  return `https://token-plan-${region}.xiaomimimo.com/v1`;
}
