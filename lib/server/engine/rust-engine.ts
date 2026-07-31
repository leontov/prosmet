import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "@/lib/zod";
import type { EstimateDraft } from "@/lib/domain/estimate";

const DecimalMapSchema = z.record(z.string(), z.string().regex(/^-?\d+(?:\.\d+)?$/));
const RustOutputSchema = z.object({
  itemAmounts: DecimalMapSchema,
  sectionTotals: DecimalMapSchema,
  directCost: z.string(),
  overhead: z.string(),
  profit: z.string(),
  discount: z.string(),
  subtotal: z.string(),
  vat: z.string(),
  total: z.string(),
  engine: z.literal("rust"),
  engineVersion: z.string().min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/)
});

export type RustEstimateCalculation = z.infer<typeof RustOutputSchema>;

async function engineBinary() {
  const candidates = [
    process.env.PROSMET_RUST_ENGINE_BIN,
    path.join(homedir(), ".prosmet", "bin", "prosmet-engine-cli"),
    path.join(process.cwd(), "target", "release", "prosmet-engine-cli"),
    path.join(process.cwd(), "target", "debug", "prosmet-engine-cli")
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next immutable or development binary.
    }
  }
  throw new Error("Authoritative Rust engine is not installed. Run npm run engine:build or deployment/install-rust-engine.sh.");
}

export async function calculateWithRust(
  draft: EstimateDraft,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<RustEstimateCalculation> {
  const binary = await engineBinary();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Rust engine timeout")), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: process.env.HOME ?? homedir(),
    LANG: "C.UTF-8",
    RUST_BACKTRACE: "0"
  };

  try {
    return await new Promise<RustEstimateCalculation>((resolve, reject) => {
      const child = spawn(binary, [], {
        stdio: ["pipe", "pipe", "pipe"],
        signal,
        shell: false,
        env: environment
      }) as ChildProcessWithoutNullStreams;
      let stdout = "";
      let stderr = "";
      const append = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(-2_000_000);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = append(stdout, chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = append(stderr, chunk);
      });
      child.on("error", reject);
      child.on("close", (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`Rust engine exited with ${code}: ${stderr.trim() || "no diagnostics"}`));
          return;
        }
        try {
          resolve(RustOutputSchema.parse(JSON.parse(stdout)));
        } catch (error) {
          reject(new Error(`Rust engine returned invalid output: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
      child.stdin.end(JSON.stringify(draft));
    });
  } finally {
    clearTimeout(timer);
  }
}

export function rustCalculationAsNumbers(result: RustEstimateCalculation) {
  const map = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
  return {
    itemAmounts: map(result.itemAmounts),
    sectionTotals: map(result.sectionTotals),
    directCost: Number(result.directCost),
    overhead: Number(result.overhead),
    profit: Number(result.profit),
    discount: Number(result.discount),
    subtotal: Number(result.subtotal),
    vat: Number(result.vat),
    total: Number(result.total)
  };
}
