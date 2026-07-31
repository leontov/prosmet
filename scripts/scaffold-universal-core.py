#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES: dict[str, str] = {
    "Cargo.toml": r'''[workspace]
members = [
  "crates/prosmet-engine",
  "apps/desktop/src-tauri"
]
resolver = "2"
''',
    "crates/prosmet-engine/Cargo.toml": r'''[package]
name = "prosmet-engine"
version = "1.0.0"
edition = "2024"
license = "Proprietary"
description = "Authoritative deterministic calculation engine for Prosmet"

[lib]
name = "prosmet_engine"
path = "src/lib.rs"

[[bin]]
name = "prosmet-engine-cli"
path = "src/main.rs"

[dependencies]
hex = "0.4"
rust_decimal = "1.37"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
sha2 = "0.10"
thiserror = "2"
''',
    "crates/prosmet-engine/src/lib.rs": r'''use rust_decimal::{Decimal, RoundingStrategy};
use serde::de::{self, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;
use thiserror::Error;

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy)]
pub struct DecimalInput(pub Decimal);

impl<'de> Deserialize<'de> for DecimalInput {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DecimalVisitor;

        impl<'de> Visitor<'de> for DecimalVisitor {
            type Value = DecimalInput;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a finite decimal number or decimal string")
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DecimalInput(Decimal::from(value)))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(DecimalInput(Decimal::from(value)))
            }

            fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                if !value.is_finite() {
                    return Err(E::custom("non-finite decimal"));
                }
                Decimal::from_str(&value.to_string())
                    .map(DecimalInput)
                    .map_err(E::custom)
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Decimal::from_str(value.trim())
                    .map(DecimalInput)
                    .map_err(E::custom)
            }

            fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                self.visit_str(&value)
            }
        }

        deserializer.deserialize_any(DecimalVisitor)
    }
}

fn one() -> DecimalInput {
    DecimalInput(Decimal::ONE)
}

fn zero() -> DecimalInput {
    DecimalInput(Decimal::ZERO)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateItemInput {
    pub id: String,
    pub quantity: DecimalInput,
    #[serde(default = "one")]
    pub norm: DecimalInput,
    #[serde(default = "one")]
    pub coefficient: DecimalInput,
    pub unit_price: DecimalInput,
}

#[derive(Debug, Deserialize)]
pub struct EstimateSectionInput {
    pub id: String,
    #[serde(default)]
    pub items: Vec<EstimateItemInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimateInput {
    #[serde(default)]
    pub sections: Vec<EstimateSectionInput>,
    #[serde(default = "zero")]
    pub overhead_percent: DecimalInput,
    #[serde(default = "zero")]
    pub profit_percent: DecimalInput,
    #[serde(default = "zero")]
    pub discount_percent: DecimalInput,
    #[serde(default = "zero")]
    pub vat_percent: DecimalInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculationCore {
    pub item_amounts: BTreeMap<String, String>,
    pub section_totals: BTreeMap<String, String>,
    pub direct_cost: String,
    pub overhead: String,
    pub profit: String,
    pub discount: String,
    pub subtotal: String,
    pub vat: String,
    pub total: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalculationOutput {
    #[serde(flatten)]
    pub calculation: CalculationCore,
    pub engine: &'static str,
    pub engine_version: &'static str,
    pub digest: String,
}

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("negative value in {0}")]
    NegativeValue(String),
    #[error("duplicate item id: {0}")]
    DuplicateItem(String),
    #[error("duplicate section id: {0}")]
    DuplicateSection(String),
    #[error("calculation serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

fn money(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(2, RoundingStrategy::MidpointAwayFromZero)
}

fn decimal_string(value: Decimal) -> String {
    money(value).normalize().to_string()
}

fn non_negative(label: &str, value: Decimal) -> Result<(), EngineError> {
    if value < Decimal::ZERO {
        return Err(EngineError::NegativeValue(label.to_owned()));
    }
    Ok(())
}

pub fn calculate_estimate(input: &EstimateInput) -> Result<CalculationOutput, EngineError> {
    for (label, value) in [
        ("overheadPercent", input.overhead_percent.0),
        ("profitPercent", input.profit_percent.0),
        ("discountPercent", input.discount_percent.0),
        ("vatPercent", input.vat_percent.0),
    ] {
        non_negative(label, value)?;
    }

    let mut item_amounts = BTreeMap::new();
    let mut section_totals = BTreeMap::new();
    let mut direct = Decimal::ZERO;

    for section in &input.sections {
        if section_totals.contains_key(&section.id) {
            return Err(EngineError::DuplicateSection(section.id.clone()));
        }
        let mut section_total = Decimal::ZERO;
        for item in &section.items {
            for (label, value) in [
                ("quantity", item.quantity.0),
                ("norm", item.norm.0),
                ("coefficient", item.coefficient.0),
                ("unitPrice", item.unit_price.0),
            ] {
                non_negative(&format!("{}.{}", item.id, label), value)?;
            }
            if item_amounts.contains_key(&item.id) {
                return Err(EngineError::DuplicateItem(item.id.clone()));
            }
            let amount = money(money(item.quantity.0) * item.norm.0 * item.coefficient.0 * item.unit_price.0);
            item_amounts.insert(item.id.clone(), decimal_string(amount));
            section_total += amount;
        }
        let rounded_section = money(section_total);
        section_totals.insert(section.id.clone(), decimal_string(rounded_section));
        direct += rounded_section;
    }

    direct = money(direct);
    let overhead = money(direct * input.overhead_percent.0 / Decimal::from(100));
    let profit_base = direct + overhead;
    let profit = money(profit_base * input.profit_percent.0 / Decimal::from(100));
    let before_discount = profit_base + profit;
    let discount = money(before_discount * input.discount_percent.0 / Decimal::from(100));
    let subtotal = money(before_discount - discount);
    let vat = money(subtotal * input.vat_percent.0 / Decimal::from(100));
    let total = money(subtotal + vat);

    let calculation = CalculationCore {
        item_amounts,
        section_totals,
        direct_cost: decimal_string(direct),
        overhead: decimal_string(overhead),
        profit: decimal_string(profit),
        discount: decimal_string(discount),
        subtotal: decimal_string(subtotal),
        vat: decimal_string(vat),
        total: decimal_string(total),
    };
    let canonical = serde_json::to_vec(&calculation)?;
    let digest = hex::encode(Sha256::digest(canonical));

    Ok(CalculationOutput {
        calculation,
        engine: "rust",
        engine_version: ENGINE_VERSION,
        digest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(value: serde_json::Value) -> EstimateInput {
        serde_json::from_value(value).expect("valid estimate")
    }

    #[test]
    fn matches_the_reference_estimate() {
        let input = parse(serde_json::json!({
            "sections": [{
                "id": "main",
                "items": [
                    {"id":"work","quantity":56,"norm":1,"coefficient":1,"unitPrice":520},
                    {"id":"primer","quantity":56,"norm":1,"coefficient":1,"unitPrice":40},
                    {"id":"beacons","quantity":120,"norm":1,"coefficient":1,"unitPrice":28},
                    {"id":"corners","quantity":60,"norm":1,"coefficient":1,"unitPrice":18},
                    {"id":"film","quantity":70,"norm":1,"coefficient":1,"unitPrice":12}
                ]
            }],
            "overheadPercent": 0,
            "profitPercent": 0,
            "discountPercent": 0,
            "vatPercent": 0
        }));
        let result = calculate_estimate(&input).expect("calculation");
        assert_eq!(result.calculation.total, "36640");
        assert_eq!(result.calculation.item_amounts["work"], "29120");
        assert_eq!(result.digest.len(), 64);
    }

    #[test]
    fn applies_markups_discount_and_vat_in_the_same_order_as_the_web_engine() {
        let input = parse(serde_json::json!({
            "sections": [{"id":"s","items":[{"id":"i","quantity":"3.335","norm":1,"coefficient":1,"unitPrice":"100.005"}]}],
            "overheadPercent":10,
            "profitPercent":20,
            "discountPercent":5,
            "vatPercent":20
        }));
        let result = calculate_estimate(&input).expect("calculation");
        assert_eq!(result.calculation.direct_cost, "334.02");
        assert_eq!(result.calculation.overhead, "33.4");
        assert_eq!(result.calculation.profit, "73.48");
        assert_eq!(result.calculation.discount, "22.05");
        assert_eq!(result.calculation.subtotal, "418.85");
        assert_eq!(result.calculation.vat, "83.77");
        assert_eq!(result.calculation.total, "502.62");
    }
}
''',
    "crates/prosmet-engine/src/main.rs": r'''use prosmet_engine::{ENGINE_VERSION, EstimateInput, calculate_estimate};
use serde_json::json;
use std::io::{self, Read};

fn main() {
    if std::env::args().any(|arg| arg == "--health") {
        println!("{}", json!({"ok": true, "engine": "rust", "version": ENGINE_VERSION}));
        return;
    }

    let mut raw = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut raw) {
        eprintln!("{}", json!({"ok": false, "error": "read_failed", "message": error.to_string()}));
        std::process::exit(2);
    }

    let input: EstimateInput = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("{}", json!({"ok": false, "error": "invalid_input", "message": error.to_string()}));
            std::process::exit(2);
        }
    };

    match calculate_estimate(&input) {
        Ok(result) => println!("{}", serde_json::to_string(&result).expect("serialize result")),
        Err(error) => {
            eprintln!("{}", json!({"ok": false, "error": "calculation_failed", "message": error.to_string()}));
            std::process::exit(3);
        }
    }
}
''',
    "crates/prosmet-engine/README.md": r'''# Prosmet Engine

Authoritative deterministic Rust calculation engine. It mirrors the web preview calculation order, uses decimal arithmetic and half-up monetary rounding, emits a SHA-256 digest, and rejects negative or duplicate calculation identifiers.

```bash
cargo test -p prosmet-engine
cargo build --release -p prosmet-engine
echo '{"sections":[]}' | target/release/prosmet-engine-cli
```
''',
    "lib/server/engine/rust-engine.ts": r'''import "server-only";

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
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

  try {
    return await new Promise<RustEstimateCalculation>((resolve, reject) => {
      const child = spawn(binary, [], {
        stdio: ["pipe", "pipe", "pipe"],
        signal,
        shell: false,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: process.env.HOME ?? homedir(),
          LANG: "C.UTF-8",
          RUST_BACKTRACE: "0"
        }
      });
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
      child.on("close", (code) => {
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
''',
    "app/api/engine/calculate/route.ts": r'''import { ZodError } from "zod";
import { EstimateDraftSchema } from "@/lib/domain/estimate";
import { calculateWithRust, rustCalculationAsNumbers } from "@/lib/server/engine/rust-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const draft = EstimateDraftSchema.parse(await request.json());
    const result = await calculateWithRust(draft, { signal: request.signal });
    return Response.json(
      {
        ok: true,
        engine: result.engine,
        engineVersion: result.engineVersion,
        digest: result.digest,
        calculation: rustCalculationAsNumbers(result)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const invalid = error instanceof ZodError;
    return Response.json(
      {
        ok: false,
        error: invalid ? "invalid_estimate" : "rust_engine_unavailable",
        message: error instanceof Error ? error.message : "Расчётный движок недоступен"
      },
      { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
''',
    "lib/client/rust-engine.ts": r'''import { calculateEstimate, type EstimateCalculation, type EstimateDraft } from "@/lib/domain/estimate";

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
''',
    "deployment/install-rust-engine.sh": r'''#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${HOME}/.prosmet"
BIN_DIR="${ROOT}/bin"
TARGET="${BIN_DIR}/prosmet-engine-cli"
STAGING="${TARGET}.staging-$$"

cargo test -p prosmet-engine
cargo build --release -p prosmet-engine
mkdir -p "${BIN_DIR}"
install -m 0755 target/release/prosmet-engine-cli "${STAGING}"
"${STAGING}" --health
mv -f "${STAGING}" "${TARGET}"
"${TARGET}" --health > "${ROOT}/rust-engine-status.json"
echo "Installed ${TARGET}"
''',
    "lib/server/agents/codex-app-server.ts": r'''import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult
} from "@/lib/server/agents/provider-contract";

const CODEX_BIN = process.env.PROSMET_CODEX_BIN?.trim() || "codex";

type RpcMessage = {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message?: string };
};

function safeEnvironment() {
  const allowed = [
    "PATH", "HOME", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "TERM",
    "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMPDIR",
    "OPENAI_API_KEY", "OPENAI_BASE_URL", "CODEX_HOME", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"
  ];
  return Object.fromEntries(
    allowed.flatMap((name) => (process.env[name] ? [[name, process.env[name] as string]] : []))
  );
}

function textFromItem(item: Record<string, unknown>) {
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (Array.isArray(item.content)) {
    return item.content
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const value = part as Record<string, unknown>;
        return typeof value.text === "string" ? [value.text] : [];
      })
      .join("\n");
  }
  return "";
}

class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<number | string, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  private readonly listeners = new Set<(message: RpcMessage) => void>();
  private stderr = "";

  constructor() {
    this.child = spawn(CODEX_BIN, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: safeEnvironment()
    });
    createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-100_000);
    });
    this.child.on("error", (error) => this.failAll(error));
    this.child.on("close", (code) => this.failAll(new Error(`Codex App Server exited with ${code}: ${this.stderr.trim()}`)));
  }

  private write(message: RpcMessage) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (message.id !== undefined && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || "Codex App Server RPC error"));
        else pending.resolve(message.result);
      }
      return;
    }
    if (message.id !== undefined && message.method) {
      // This semantic adapter is read-only and never grants tool execution approvals.
      this.write({ id: message.id, result: { decision: "decline" } });
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  request<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    this.write({ method, params });
  }

  onNotification(listener: (message: RpcMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close() {
    this.child.kill("SIGTERM");
  }
}

function withTimeout<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = 120_000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(combined.reason instanceof Error ? combined.reason : new Error("Codex App Server cancelled"));
    if (combined.aborted) return abort();
    combined.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => combined.removeEventListener("abort", abort));
  });
}

export async function checkCodexAppServer() {
  const child = spawn(CODEX_BIN, ["app-server", "--help"], { stdio: ["ignore", "pipe", "pipe"], shell: false, env: safeEnvironment() });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error("Codex App Server is not available on Primary.");
  return { connected: true, detail: "Codex App Server JSON-RPC is installed on Primary." };
}

export async function runCodexAppServerSemantic(input: {
  prompt: string;
  messages?: unknown;
  state?: unknown;
  signal?: AbortSignal;
  model?: string;
  resumeSessionId?: string;
}): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const client = new CodexAppServerClient();
  let threadId = input.resumeSessionId ?? "";
  let text = "";
  let turnId = "";
  try {
    await withTimeout(client.request("initialize", {
      clientInfo: { name: "prosmet", title: "Просметчик", version: "1.0.0" },
      capabilities: { experimentalApi: true }
    }), input.signal, 15_000);
    client.notify("initialized");

    const threadResponse = input.resumeSessionId
      ? await withTimeout<Record<string, unknown>>(client.request("thread/resume", { threadId: input.resumeSessionId }), input.signal, 30_000)
      : await withTimeout<Record<string, unknown>>(client.request("thread/start", {
          cwd: process.env.PROSMET_CODEX_WORKSPACE || process.cwd(),
          approvalPolicy: "never",
          sandbox: "readOnly",
          ephemeral: false,
          ...(input.model ? { model: input.model } : {})
        }), input.signal, 30_000);
    const thread = threadResponse.thread && typeof threadResponse.thread === "object"
      ? (threadResponse.thread as Record<string, unknown>)
      : threadResponse;
    threadId = typeof thread.id === "string" ? thread.id : threadId;
    if (!threadId) throw new Error("Codex App Server did not return a thread id.");

    const completed = new Promise<void>((resolve, reject) => {
      const unsubscribe = client.onNotification((message) => {
        const params = message.params ?? {};
        if (message.method === "item/agentMessage/delta" && typeof params.delta === "string") {
          text += params.delta;
        }
        if (message.method === "item/completed" && params.item && typeof params.item === "object") {
          const item = params.item as Record<string, unknown>;
          if (item.type === "agentMessage") {
            const complete = textFromItem(item);
            if (complete) text = complete;
          }
        }
        if (message.method === "turn/completed") {
          const turn = params.turn && typeof params.turn === "object" ? (params.turn as Record<string, unknown>) : {};
          if (turnId && typeof turn.id === "string" && turn.id !== turnId) return;
          unsubscribe();
          if (turn.status === "failed") {
            const error = turn.error && typeof turn.error === "object" ? (turn.error as Record<string, unknown>) : {};
            reject(new Error(typeof error.message === "string" ? error.message : "Codex turn failed"));
          } else resolve();
        }
      });
    });

    const semanticPrompt = `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}`;
    const turnResponse = await withTimeout<Record<string, unknown>>(client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: semanticPrompt }],
      approvalPolicy: "never",
      sandboxPolicy: { type: "readOnly" },
      ...(input.model ? { model: input.model } : {})
    }), input.signal, 30_000);
    const turn = turnResponse.turn && typeof turnResponse.turn === "object"
      ? (turnResponse.turn as Record<string, unknown>)
      : turnResponse;
    turnId = typeof turn.id === "string" ? turn.id : "";
    await withTimeout(completed, input.signal, Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS) || 120_000);
    if (!text.trim()) throw new Error("Codex App Server completed without an assistant message.");
    return {
      interpretation: parseProviderInterpretation(text),
      sessionId: threadId,
      usage: { durationMs: Date.now() - started }
    };
  } finally {
    client.close();
  }
}
''',
    "lib/server/agents/universal-protocols.ts": r'''import "server-only";

import { randomUUID } from "node:crypto";
import {
  parseProviderInterpretation,
  providerSystemPrompt,
  providerUserPrompt,
  type ProviderSemanticResult
} from "@/lib/server/agents/provider-contract";
import type { ProviderRuntimeConnection } from "@/lib/server/services/providers";

function authHeaders(connection: ProviderRuntimeConnection) {
  const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
  if (connection.apiKey) headers.set("Authorization", `Bearer ${connection.apiKey}`);
  return headers;
}

function timeoutSignal(parent?: AbortSignal) {
  const timeout = AbortSignal.timeout(Number(process.env.PROSMET_PROVIDER_TIMEOUT_MS) || 120_000);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectText);
  const record = value as Record<string, unknown>;
  const direct = [record.text, record.content, record.delta].flatMap(collectText);
  const nested = [record.message, record.parts, record.artifacts, record.status, record.result].flatMap(collectText);
  return [...direct, ...nested];
}

export async function probeUniversalAgent(connection: ProviderRuntimeConnection) {
  if (connection.kind === "a2a") {
    const base = connection.baseUrl.replace(/\/$/, "");
    const response = await fetch(`${base}/.well-known/agent-card.json`, {
      headers: authHeaders(connection), cache: "no-store", signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) throw new Error(`A2A Agent Card returned ${response.status}.`);
    const card = await response.json() as Record<string, unknown>;
    return { connected: true, detail: `A2A v1 agent connected${typeof card.name === "string" ? ` · ${card.name}` : ""}.` };
  }
  const response = await fetch(connection.baseUrl, {
    method: "OPTIONS", headers: authHeaders(connection), cache: "no-store", signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok && response.status !== 405) throw new Error(`AG-UI endpoint returned ${response.status}.`);
  return { connected: true, detail: "AG-UI streaming endpoint is reachable." };
}

export async function runA2ACompatible(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const response = await fetch(connection.baseUrl, {
    method: "POST",
    headers: authHeaders(connection),
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "message/send",
      params: {
        message: {
          role: "user",
          messageId: randomUUID(),
          parts: [{ kind: "text", text: `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}` }]
        },
        configuration: { acceptedOutputModes: ["text", "application/json"] }
      }
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`A2A agent returned ${response.status}: ${raw.slice(0, 2000)}`);
  const payload = JSON.parse(raw) as Record<string, unknown>;
  if (payload.error) throw new Error(`A2A error: ${JSON.stringify(payload.error).slice(0, 2000)}`);
  const text = collectText(payload.result).filter(Boolean).join("\n");
  if (!text.trim()) throw new Error("A2A agent returned no text artifact.");
  return { interpretation: parseProviderInterpretation(text), usage: { durationMs: Date.now() - started } };
}

export async function runAgUiCompatible(
  connection: ProviderRuntimeConnection,
  input: { prompt: string; messages?: unknown; state?: unknown; signal?: AbortSignal }
): Promise<ProviderSemanticResult> {
  const started = Date.now();
  const response = await fetch(connection.baseUrl, {
    method: "POST",
    headers: new Headers({ ...Object.fromEntries(authHeaders(connection)), Accept: "text/event-stream" }),
    cache: "no-store",
    signal: timeoutSignal(input.signal),
    body: JSON.stringify({
      threadId: randomUUID(),
      runId: randomUUID(),
      messages: [{ id: randomUUID(), role: "user", content: [{ type: "text", text: `${providerSystemPrompt()}\n\n${providerUserPrompt(input)}` }] }],
      tools: [],
      context: {},
      state: input.state ?? {}
    })
  });
  if (!response.ok || !response.body) throw new Error(`AG-UI agent returned ${response.status}.`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
        if (event.type === "TEXT_MESSAGE_CONTENT") {
          const delta = typeof event.delta === "string" ? event.delta : typeof event.content === "string" ? event.content : "";
          text += delta;
        }
        if (event.type === "RUN_ERROR") throw new Error(typeof event.message === "string" ? event.message : "AG-UI run failed");
      }
    }
  }
  if (!text.trim()) throw new Error("AG-UI agent completed without text content.");
  return { interpretation: parseProviderInterpretation(text), usage: { durationMs: Date.now() - started } };
}
''',
    "lib/domain/client-manifest.ts": r'''import { z } from "zod";

export const ClientModuleSchema = z.enum([
  "chat", "objects", "estimates", "documents", "prices", "settings", "profile", "admin"
]);

export const ClientManifestSchema = z.object({
  version: z.number().int().positive().default(1),
  productName: z.string().trim().min(2).max(80).default("Просметчик"),
  assistantName: z.string().trim().min(2).max(80).default("Просметчик"),
  organizationName: z.string().trim().max(160).default(""),
  logoUrl: z.string().url().or(z.literal("")).default(""),
  modules: z.array(ClientModuleSchema).min(1).default(["chat", "objects", "estimates", "documents", "prices", "settings", "profile"]),
  features: z.object({
    rustApprovalGate: z.boolean().default(true),
    nativeShare: z.boolean().default(true),
    a2aDeveloperMode: z.boolean().default(false),
    priceIntelligence: z.boolean().default(true),
    documents: z.boolean().default(true)
  }).default({}),
  terminology: z.record(z.string(), z.string()).default({}),
  updatedAt: z.string().default(() => new Date().toISOString())
});

export type ClientManifest = z.infer<typeof ClientManifestSchema>;
export type ClientModule = z.infer<typeof ClientModuleSchema>;

export const DEFAULT_CLIENT_MANIFEST: ClientManifest = ClientManifestSchema.parse({});
''',
    "lib/server/services/client-manifest.ts": r'''import "server-only";

import { ClientManifestSchema, DEFAULT_CLIENT_MANIFEST, type ClientManifest } from "@/lib/domain/client-manifest";
import { ensureTenant, getServerDatabase, postgresConfigured, writeAuditEvent } from "@/lib/server/postgres";

export async function loadClientManifest(tenantId: string): Promise<ClientManifest> {
  if (!postgresConfigured()) return DEFAULT_CLIENT_MANIFEST;
  await ensureTenant(tenantId);
  const result = await (await getServerDatabase()).query<{ manifest_json: unknown; updated_at: Date | string }>(
    `SELECT manifest_json, updated_at FROM prosmet_client_manifests WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!result.rows[0]) return DEFAULT_CLIENT_MANIFEST;
  return ClientManifestSchema.parse({
    ...(result.rows[0].manifest_json as Record<string, unknown>),
    updatedAt: new Date(result.rows[0].updated_at).toISOString()
  });
}

export async function saveClientManifest(tenantId: string, raw: unknown): Promise<ClientManifest> {
  await ensureTenant(tenantId);
  const manifest = ClientManifestSchema.parse({ ...(raw as Record<string, unknown>), updatedAt: new Date().toISOString() });
  await (await getServerDatabase()).query(
    `INSERT INTO prosmet_client_manifests (tenant_id, manifest_json, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET manifest_json = EXCLUDED.manifest_json, updated_at = NOW()`,
    [tenantId, JSON.stringify(manifest)]
  );
  await writeAuditEvent(tenantId, "client_manifest_updated", { modules: manifest.modules, version: manifest.version });
  return loadClientManifest(tenantId);
}
''',
    "lib/server/auth/roles.ts": r'''import "server-only";

import { getServerDatabase, postgresConfigured } from "@/lib/server/postgres";

export class AuthorizationError extends Error {
  code = "superadmin_required";
  constructor(message = "Требуются права супер-администратора.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function listRoles(ownerId: string) {
  if (!postgresConfigured()) return [] as string[];
  const result = await (await getServerDatabase()).query<{ role: string }>(
    `SELECT role FROM prosmet_memberships WHERE owner_id = $1 AND active = TRUE ORDER BY role`,
    [ownerId]
  );
  return result.rows.map((row) => row.role);
}

export async function assertSuperAdmin(ownerId: string) {
  if (process.env.PROSMET_ADMIN_MODE === "permissive") return;
  const roles = await listRoles(ownerId);
  if (!roles.includes("super_admin")) throw new AuthorizationError();
}
''',
    "app/api/client-manifest/route.ts": r'''import { ZodError } from "zod";
import { resolveServerIdentity } from "@/lib/server/identity";
import { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";
import { loadClientManifest, saveClientManifest } from "@/lib/server/services/client-manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function headers(identity: ReturnType<typeof resolveServerIdentity>) {
  const value = new Headers({ "Cache-Control": "no-store" });
  if (identity.setCookie) value.append("Set-Cookie", identity.setCookie);
  return value;
}

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    return Response.json({ ok: true, manifest: await loadClientManifest(identity.ownerId) }, { headers: headers(identity) });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "Manifest unavailable" }, { status: 503, headers: headers(identity) });
  }
}

export async function PUT(request: Request) {
  const identity = resolveServerIdentity(request);
  try {
    await assertSuperAdmin(identity.ownerId);
    return Response.json({ ok: true, manifest: await saveClientManifest(identity.ownerId, await request.json()) }, { headers: headers(identity) });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : error instanceof ZodError ? 400 : 503;
    return Response.json({ ok: false, message: error instanceof Error ? error.message : "Manifest save failed" }, { status, headers: headers(identity) });
  }
}
''',
    "lib/client/use-client-manifest.ts": r'''"use client";

import { useEffect, useState } from "react";
import { ClientManifestSchema, DEFAULT_CLIENT_MANIFEST } from "@/lib/domain/client-manifest";

export function useClientManifest() {
  const [manifest, setManifest] = useState(DEFAULT_CLIENT_MANIFEST);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/client-manifest", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.manifest) setManifest(ClientManifestSchema.parse(payload.manifest));
      })
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => { active = false; };
  }, []);
  return { manifest, ready, hasModule: (module: string) => manifest.modules.includes(module as never) };
}
''',
    "app/api/identity/route.ts": r'''import { resolveServerIdentity } from "@/lib/server/identity";
import { listRoles } from "@/lib/server/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = resolveServerIdentity(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (identity.setCookie) headers.append("Set-Cookie", identity.setCookie);
  return Response.json({ ok: true, ownerId: identity.ownerId, guest: identity.isGuest, roles: await listRoles(identity.ownerId) }, { headers });
}
''',
    "scripts/bootstrap-superadmin.mjs": r'''import { randomUUID } from "node:crypto";
import pg from "pg";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : "";
}

const ownerId = argument("owner");
const email = argument("email");
const tenantId = argument("tenant") || ownerId;
if (!ownerId || !/^[a-zA-Z0-9:_-]{8,160}$/.test(ownerId)) {
  throw new Error("Pass --owner from GET /api/identity (for example guest:uuid).");
}
if (!email || !email.includes("@")) throw new Error("Pass --email for the super-admin audit record.");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString?.startsWith("postgresql://")) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString, application_name: "prosmet-superadmin-bootstrap" });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`INSERT INTO prosmet_tenants (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [tenantId]);
  await client.query(
    `INSERT INTO prosmet_memberships (id, tenant_id, owner_id, email, role, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'super_admin', TRUE, NOW(), NOW())
     ON CONFLICT (tenant_id, owner_id, role) DO UPDATE SET email = EXCLUDED.email, active = TRUE, updated_at = NOW()`,
    [`membership_${randomUUID()}`, tenantId, ownerId, email]
  );
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, tenantId, ownerId, email, role: "super_admin" }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
''',
    "scripts/universal-platform-contract.mjs": r'''import { access, readFile } from "node:fs/promises";

const required = [
  "Cargo.toml",
  "crates/prosmet-engine/src/lib.rs",
  "crates/prosmet-engine/src/main.rs",
  "lib/server/engine/rust-engine.ts",
  "app/api/engine/calculate/route.ts",
  "lib/server/agents/codex-app-server.ts",
  "lib/server/agents/universal-protocols.ts",
  "lib/domain/client-manifest.ts",
  "app/api/client-manifest/route.ts",
  "scripts/bootstrap-superadmin.mjs",
  "apps/mobile/package.json",
  "apps/mobile/app/index.tsx",
  "apps/desktop/src-tauri/src/main.rs",
  "docs/UNIVERSAL_ARCHITECTURE.md",
  "docs/STORE_RELEASE.md"
];
await Promise.all(required.map((file) => access(file)));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
for (const script of ["engine:build", "engine:test", "admin:bootstrap", "universal:contract", "mobile:typecheck", "desktop:check"]) {
  if (!packageJson.scripts?.[script]) throw new Error(`Missing package script ${script}`);
}
const premium = await readFile("components/app/premium-prosmet-application.tsx", "utf8");
if (!premium.includes("verifyEstimateWithRust")) throw new Error("Rust approval gate is not wired into the estimate workflow");
const providers = await readFile("lib/server/services/providers.ts", "utf8");
for (const kind of ["codex-app-server", "a2a", "ag-ui"]) {
  if (!providers.includes(`\"${kind}\"`)) throw new Error(`Missing universal provider ${kind}`);
}
console.log(JSON.stringify({ ok: true, contract: "universal-platform-v1", requiredFiles: required.length }, null, 2));
''',
    "docs/UNIVERSAL_ARCHITECTURE.md": r'''# Universal Prosmet Architecture

Prosmet is a universal assistant-first work system. A tenant manifest selects the modules, terminology and capabilities shown to each customer; the default surface stays quiet and GPT-like.

```mermaid
flowchart TD
  WEB[Next.js Web · assistant-ui] --> AGUI[AG-UI / A2A Gateway]
  IOS[Expo iOS · assistant-ui native] --> AGUI
  ANDROID[Expo Android · assistant-ui native] --> AGUI
  DESKTOP[Tauri 2 Desktop] --> WEB
  AGUI --> ROUTER[Universal Agent Router]
  ROUTER --> CODEX[Codex App Server JSON-RPC]
  ROUTER --> A2A[A2A v1 Agents]
  ROUTER --> OPENAI[OpenAI-compatible / MiMo]
  ROUTER --> OLLAMA[Ollama]
  ROUTER --> RULES[Rules Agent]
  WEB --> RUST[Rust Calculation Engine]
  IOS --> RUST
  ANDROID --> RUST
  RUST --> PG[(PostgreSQL Source of Truth)]
  WEB --> IDB[(IndexedDB Offline Cache)]
  IOS --> SQLITE[(SQLite Offline Cache)]
  ANDROID --> SQLITE
```

## Product boundaries

- assistant-ui owns chat primitives, runtime state, streaming, branching, tools and threads.
- AG-UI is the primary UI-to-agent event protocol; A2A is the external agent interoperability protocol.
- Codex App Server is the rich Codex integration; `codex exec` remains a compatibility path.
- PostgreSQL is the authoritative shared store. IndexedDB and native SQLite are offline caches with outboxes.
- Rust is the authoritative approval calculation. TypeScript/native calculations are previews and must match Rust before approval.
- Tenant manifests control visible modules without forking the application.

## Security invariants

Provider secrets never reach clients. Mutating provider and manifest APIs require a bootstrapped `super_admin`. Rust is spawned without a shell and with a bounded environment/output. External provider endpoints require HTTPS except explicitly allowed local Ollama endpoints.
''',
    "docs/SUPERADMIN.md": r'''# Super-admin bootstrap

1. Open the deployed application once, then read the current owner identifier:

```bash
curl -c /tmp/prosmet.cookies https://kolibriai.online/api/identity
```

For the browser session, use DevTools Network on `/api/identity` or display the identifier in the profile settings.

2. On Primary, load the database environment and grant the role to that owner:

```bash
source "$HOME/.prosmet/database.env"
cd /path/to/prosmet
npm run admin:bootstrap -- \
  --owner 'guest:REPLACE_WITH_OWNER_ID' \
  --email 'owner@example.com'
```

3. Refresh the application. `/api/identity` must now return `"super_admin"` in `roles`. Provider connections and tenant UI manifests can then be changed from that same browser identity.

The command is idempotent and writes an auditable PostgreSQL membership. It does not create a reusable plaintext password or API key.
'''
}


def write_files() -> None:
    for relative, content in FILES.items():
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content.rstrip() + "\n", encoding="utf-8")


def replace(path: str, old: str, new: str, *, required: bool = True) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if old not in text:
        if required and new not in text:
            raise RuntimeError(f"Replacement anchor missing in {path}: {old[:100]!r}")
        return
    target.write_text(text.replace(old, new), encoding="utf-8")


def modify_package() -> None:
    path = ROOT / "package.json"
    package = json.loads(path.read_text(encoding="utf-8"))
    scripts = package.setdefault("scripts", {})
    scripts.update({
        "engine:build": "cargo build --release -p prosmet-engine",
        "engine:test": "cargo test -p prosmet-engine",
        "admin:bootstrap": "node scripts/bootstrap-superadmin.mjs",
        "universal:contract": "node scripts/universal-platform-contract.mjs",
        "mobile:typecheck": "npm run typecheck --prefix apps/mobile",
        "desktop:check": "cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml"
    })
    if "node scripts/universal-platform-contract.mjs" not in scripts["source:contract"]:
        scripts["source:contract"] += " && node scripts/universal-platform-contract.mjs"
    path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def modify_application() -> None:
    replace(
        "components/app/premium-prosmet-application.tsx",
        'import { cloneEstimate, validateForApproval, type EstimateDraft } from "@/lib/domain/estimate";',
        'import { cloneEstimate, validateForApproval, type EstimateDraft } from "@/lib/domain/estimate";\nimport { verifyEstimateWithRust } from "@/lib/client/rust-engine";'
    )
    replace(
        "components/app/premium-prosmet-application.tsx",
        '    try {\n      const approved: EstimateDraft = {',
        '    try {\n      await verifyEstimateWithRust(current);\n      const approved: EstimateDraft = {'
    )


def modify_providers() -> None:
    replace(
        "lib/server/services/providers.ts",
        'import { checkCodexCli } from "@/lib/server/agents/codex-cli";',
        'import { checkCodexCli } from "@/lib/server/agents/codex-cli";\nimport { checkCodexAppServer } from "@/lib/server/agents/codex-app-server";\nimport { probeUniversalAgent } from "@/lib/server/agents/universal-protocols";'
    )
    replace(
        "lib/server/services/providers.ts",
        '  "ollama",\n  "codex-cli"',
        '  "ollama",\n  "codex-cli",\n  "codex-app-server",\n  "a2a",\n  "ag-ui"'
    )
    replace(
        "lib/server/services/providers.ts",
        'if (!["rules", "codex-cli"].includes(value.kind) && !value.baseUrl)',
        'if (!["rules", "codex-cli", "codex-app-server"].includes(value.kind) && !value.baseUrl)'
    )
    replace(
        "lib/server/services/providers.ts",
        'if (kind === "rules" || kind === "codex-cli") return "";',
        'if (kind === "rules" || kind === "codex-cli" || kind === "codex-app-server") return "";'
    )
    replace(
        "lib/server/services/providers.ts",
        '  if (input.kind === "codex-cli") return checkCodexCli();\n\n  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);',
        '  if (input.kind === "codex-cli") return checkCodexCli();\n  if (input.kind === "codex-app-server") return checkCodexAppServer();\n\n  const baseUrl = normalizedBaseUrl(input.kind, input.baseUrl);\n  if (input.kind === "a2a" || input.kind === "ag-ui") {\n    return probeUniversalAgent({\n      id: "probe", kind: input.kind, name: input.kind, baseUrl, model: input.model,\n      status: "unchecked", selected: false, hasSecret: Boolean(input.apiKey),\n      lastError: null, lastCheckedAt: null, updatedAt: new Date().toISOString(), apiKey: input.apiKey\n    });\n  }'
    )

    replace(
        "lib/server/agents/provider-executor.ts",
        'import { runCodexSemantic } from "@/lib/server/agents/codex-cli";',
        'import { runCodexSemantic } from "@/lib/server/agents/codex-cli";\nimport { runCodexAppServerSemantic } from "@/lib/server/agents/codex-app-server";\nimport { runA2ACompatible, runAgUiCompatible } from "@/lib/server/agents/universal-protocols";'
    )
    replace(
        "lib/server/agents/provider-executor.ts",
        '  if (connection.kind === "ollama") return runOllama(connection, input);\n  return runOpenAiCompatible(connection, input);',
        '  if (connection.kind === "codex-app-server") {\n    return runCodexAppServerSemantic({ ...input, model: connection.model, resumeSessionId: input.resumeSessionId });\n  }\n  if (connection.kind === "a2a") return runA2ACompatible(connection, input);\n  if (connection.kind === "ag-ui") return runAgUiCompatible(connection, input);\n  if (connection.kind === "ollama") return runOllama(connection, input);\n  return runOpenAiCompatible(connection, input);'
    )


def modify_admin() -> None:
    replace(
        "app/api/providers/route.ts",
        'import { resolveServerIdentity } from "@/lib/server/identity";',
        'import { resolveServerIdentity } from "@/lib/server/identity";\nimport { assertSuperAdmin, AuthorizationError } from "@/lib/server/auth/roles";'
    )
    replace(
        "app/api/providers/route.ts",
        '    { status, headers: headers(identity) }',
        '    { status: error instanceof AuthorizationError ? 403 : status, headers: headers(identity) }'
    )
    for anchor in [
        '  try {\n    const connection = await saveProviderConnection(',
        '  try {\n    const { id } = IdentifierSchema.parse(await request.json());\n    const connection = await selectProviderConnection(',
        '  try {\n    const { id } = IdentifierSchema.parse(await request.json());\n    const result = await deleteProviderConnection('
    ]:
        replace(
            "app/api/providers/route.ts",
            anchor,
            anchor.replace('  try {\n', '  try {\n    await assertSuperAdmin(identity.ownerId);\n')
        )


def modify_settings_ui() -> None:
    replace(
        "components/tools/service-settings.tsx",
        'type ProviderKind = "rules" | "mimo" | "openai-compatible" | "ollama" | "codex-cli";',
        'type ProviderKind = "rules" | "mimo" | "openai-compatible" | "ollama" | "codex-cli" | "codex-app-server" | "a2a" | "ag-ui";'
    )
    replace(
        "components/tools/service-settings.tsx",
        'hint === "ollama" || hint === "openai-compatible" || hint === "codex-cli" || hint === "rules"',
        'hint === "ollama" || hint === "openai-compatible" || hint === "codex-cli" || hint === "codex-app-server" || hint === "a2a" || hint === "ag-ui" || hint === "rules"'
    )
    replace(
        "components/tools/service-settings.tsx",
        '<option value="codex-cli">Codex CLI · ChatGPT на Primary</option>\n                <option value="rules">',
        '<option value="codex-app-server">Codex App Server · ChatGPT</option>\n                <option value="codex-cli">Codex Exec · совместимость</option>\n                <option value="a2a">A2A v1 agent</option>\n                <option value="ag-ui">AG-UI agent</option>\n                <option value="rules">'
    )
    replace(
        "components/tools/service-settings.tsx",
        'form.kind !== "rules" && form.kind !== "codex-cli"',
        'form.kind !== "rules" && form.kind !== "codex-cli" && form.kind !== "codex-app-server"'
    )
    replace(
        "components/tools/service-settings.tsx",
        'if (kind === "codex-cli") {',
        'if (kind === "codex-cli" || kind === "codex-app-server") {'
    )
    replace(
        "components/tools/service-settings.tsx",
        'name: "Codex CLI · ChatGPT",',
        'name: kind === "codex-app-server" ? "Codex App Server · ChatGPT" : "Codex Exec · ChatGPT",'
    )


def modify_manifest_ui() -> None:
    replace(
        "components/app/premium-chat-workspace.tsx",
        'import { cn } from "@/lib/utils";',
        'import { cn } from "@/lib/utils";\nimport { useClientManifest } from "@/lib/client/use-client-manifest";'
    )
    replace(
        "components/app/premium-chat-workspace.tsx",
        '  const workspace = useLocalWorkspace();',
        '  const workspace = useLocalWorkspace();\n  const { manifest, hasModule } = useClientManifest();'
    )
    replace(
        "components/app/premium-chat-workspace.tsx",
        '<span>Просметчик</span>',
        '<span>{manifest.productName}</span>'
    )
    nav_old = '''        <PremiumNavItem
          icon={<MessageSquareTextIcon />}
          label="Чаты"
          active={view === "chat"}
          onClick={() => navigate("chat")}
        />
        <PremiumNavItem
          icon={<FolderKanbanIcon />}
          label="Объекты"
          active={view === "objects"}
          onClick={() => navigate("objects")}
        />
        <PremiumNavItem
          icon={<FileSpreadsheetIcon />}
          label="Сметы"
          active={view === "estimates"}
          onClick={() => navigate("estimates")}
        />
        <PremiumNavItem
          icon={<FileTextIcon />}
          label="Документы"
          active={view === "documents"}
          onClick={() => navigate("documents")}
        />
        <PremiumNavItem
          icon={<TagIcon />}
          label="Цены"
          active={view === "prices"}
          onClick={() => navigate("prices")}
        />'''
    nav_new = '''        {hasModule("chat") ? <PremiumNavItem icon={<MessageSquareTextIcon />} label="Чаты" active={view === "chat"} onClick={() => navigate("chat")} /> : null}
        {hasModule("objects") ? <PremiumNavItem icon={<FolderKanbanIcon />} label={manifest.terminology.objects || "Объекты"} active={view === "objects"} onClick={() => navigate("objects")} /> : null}
        {hasModule("estimates") ? <PremiumNavItem icon={<FileSpreadsheetIcon />} label={manifest.terminology.estimates || "Сметы"} active={view === "estimates"} onClick={() => navigate("estimates")} /> : null}
        {hasModule("documents") ? <PremiumNavItem icon={<FileTextIcon />} label={manifest.terminology.documents || "Документы"} active={view === "documents"} onClick={() => navigate("documents")} /> : null}
        {hasModule("prices") ? <PremiumNavItem icon={<TagIcon />} label={manifest.terminology.prices || "Цены"} active={view === "prices"} onClick={() => navigate("prices")} /> : null}'''
    replace("components/app/premium-chat-workspace.tsx", nav_old, nav_new)
    replace(
        "components/app/premium-chat-workspace.tsx",
        '<span className="block truncate text-sm font-medium">Просметчик</span>',
        '<span className="block truncate text-sm font-medium">{manifest.organizationName || manifest.productName}</span>'
    )


def modify_migration() -> None:
    addition = r'''
CREATE TABLE IF NOT EXISTS prosmet_memberships (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, owner_id, role)
);
CREATE INDEX IF NOT EXISTS idx_prosmet_memberships_owner ON prosmet_memberships(owner_id, active);

CREATE TABLE IF NOT EXISTS prosmet_client_manifests (
  tenant_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
'''
    replace("deployment/migrate-postgres.mjs", "\nCOMMIT;\n`;", "\n" + addition.strip() + "\n\nCOMMIT;\n`;")


def modify_deployment() -> None:
    replace(
        "deployment/direct-primary.sh",
        '  PROSMET_DEFAULT_PROVIDER="${PROSMET_DEFAULT_PROVIDER:-rules}" \\\n',
        '  PROSMET_DEFAULT_PROVIDER="${PROSMET_DEFAULT_PROVIDER:-rules}" \\\n  PROSMET_ADMIN_MODE="${PROSMET_ADMIN_MODE:-strict}" \\\n  PROSMET_RUST_ENGINE_BIN="${PROSMET_RUST_ENGINE_BIN:-${HOME}/.prosmet/bin/prosmet-engine-cli}" \\\n'
    )
    replace(
        ".github/workflows/launch-3200.yml",
        '      PROSMET_DEFAULT_PROVIDER: "rules"\n',
        '      PROSMET_DEFAULT_PROVIDER: "rules"\n      PROSMET_ADMIN_MODE: "permissive"\n      PROSMET_RUST_ENGINE_BIN: /home/actions-runner/.prosmet/bin/prosmet-engine-cli\n'
    )
    replace(
        ".github/workflows/launch-3200.yml",
        '      - name: Start persistent PostgreSQL\n',
        '      - name: Install authoritative Rust engine\n        run: |\n          set -o pipefail\n          bash deployment/install-rust-engine.sh 2>&1 | tee artifacts/logs/rust-engine.log\n\n      - name: Start persistent PostgreSQL\n'
    )
    replace(
        ".github/workflows/launch-3200.yml",
        '      - name: Deploy immutable release to port 3200\n        run: |',
        '      - name: Deploy immutable release to port 3200\n        env:\n          PROSMET_ADMIN_MODE: strict\n        run: |'
    )


def main() -> None:
    write_files()
    modify_package()
    modify_application()
    modify_providers()
    modify_admin()
    modify_settings_ui()
    modify_manifest_ui()
    modify_migration()
    modify_deployment()
    print(json.dumps({"ok": True, "files": len(FILES), "phase": "universal-core"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
