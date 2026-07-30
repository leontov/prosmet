import { calculateEstimate, type EstimateCalculation, type EstimateDraft } from "@/lib/domain/estimate";

type EngineResponse = {
  ok: boolean;
  engine?: string;
  engineVersion?: string;
  digest?: string;
  calculation?: EstimateCalculation;
  message?: string;
};

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) <= 0.005;
}

function compareMap(label: string, local: Record<string, number>, remote: Record<string, number>) {
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    if (!closeEnough(local[key] ?? Number.NaN, remote[key] ?? Number.NaN)) {
      throw new Error(`Расхождение Rust/TypeScript: ${label}.${key}`);
    }
  }
}

export async function verifyEstimateWithRust(draft: EstimateDraft) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Утверждение требует связи с серверным Rust-движком. Черновик уже сохранён локально.");
  }
  const response = await fetch("/api/engine/calculate", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(draft)
  });
  const payload = (await response.json().catch(() => ({}))) as EngineResponse;
  if (!response.ok || !payload.ok || payload.engine !== "rust" || !payload.calculation || !payload.digest) {
    throw new Error(payload.message || "Серверный Rust-движок не подтвердил расчёт.");
  }

  const local = calculateEstimate(draft);
  const remote = payload.calculation;
  compareMap("itemAmounts", local.itemAmounts, remote.itemAmounts);
  compareMap("sectionTotals", local.sectionTotals, remote.sectionTotals);
  for (const key of ["directCost", "overhead", "profit", "discount", "subtotal", "vat", "total"] as const) {
    if (!closeEnough(local[key], remote[key])) {
      throw new Error(`Расхождение Rust/TypeScript: ${key}`);
    }
  }
  return { calculation: remote, digest: payload.digest, engineVersion: payload.engineVersion ?? "unknown" };
}
