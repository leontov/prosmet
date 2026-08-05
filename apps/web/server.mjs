import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile, rename, chmod } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  constants as cryptoConstants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  generateKeyPairSync,
  privateDecrypt,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function createEstimateStore(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS estimates (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      project TEXT NOT NULL,
      customer TEXT NOT NULL,
      region TEXT NOT NULL,
      revision INTEGER NOT NULL,
      status TEXT NOT NULL,
      overhead_percent REAL NOT NULL,
      profit_percent REAL NOT NULL,
      vat_percent REAL NOT NULL,
      source_agent_id TEXT,
      source_request_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS estimate_sections (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id TEXT NOT NULL,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      UNIQUE (estimate_id, id),
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estimate_items (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      id TEXT NOT NULL,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      category TEXT NOT NULL,
      UNIQUE (estimate_id, section_id, id),
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_estimates_owner_updated
      ON estimates(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sections_estimate_position
      ON estimate_sections(estimate_id, position);
    CREATE INDEX IF NOT EXISTS idx_items_estimate_section_position
      ON estimate_items(estimate_id, section_id, position);
  `);

  const selectEstimate = db.prepare(`
    SELECT id, owner_id, title, project, customer, region, revision, status,
           overhead_percent, profit_percent, vat_percent, source_agent_id,
           source_request_id, created_at, updated_at
      FROM estimates
     WHERE id = ? AND owner_id = ?
  `);
  const selectSections = db.prepare(`
    SELECT id, title
      FROM estimate_sections
     WHERE estimate_id = ?
     ORDER BY position ASC
  `);
  const selectItems = db.prepare(`
    SELECT id, name, unit, quantity, unit_price, category
      FROM estimate_items
     WHERE estimate_id = ? AND section_id = ?
     ORDER BY position ASC
  `);
  const selectCreatedAt = db.prepare("SELECT created_at FROM estimates WHERE id = ? AND owner_id = ?");
  const upsertEstimate = db.prepare(`
    INSERT INTO estimates (
      id, owner_id, title, project, customer, region, revision, status,
      overhead_percent, profit_percent, vat_percent, source_agent_id,
      source_request_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      owner_id = excluded.owner_id,
      title = excluded.title,
      project = excluded.project,
      customer = excluded.customer,
      region = excluded.region,
      revision = excluded.revision,
      status = excluded.status,
      overhead_percent = excluded.overhead_percent,
      profit_percent = excluded.profit_percent,
      vat_percent = excluded.vat_percent,
      source_agent_id = COALESCE(excluded.source_agent_id, estimates.source_agent_id),
      source_request_id = COALESCE(excluded.source_request_id, estimates.source_request_id),
      updated_at = excluded.updated_at
  `);
  const deleteSections = db.prepare("DELETE FROM estimate_sections WHERE estimate_id = ?");
  const deleteItems = db.prepare("DELETE FROM estimate_items WHERE estimate_id = ?");
  const insertSection = db.prepare(`
    INSERT INTO estimate_sections (estimate_id, id, position, title)
    VALUES (?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO estimate_items (
      estimate_id, section_id, id, position, name, unit, quantity, unit_price, category
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const listIds = db.prepare(`
    SELECT id FROM estimates WHERE owner_id = ? ORDER BY updated_at DESC
  `);

  function transaction(callback) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = callback();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function getEstimate(id, ownerId = "production") {
    const row = selectEstimate.get(id, ownerId);
    if (!row) return null;
    const sections = selectSections.all(id).map((section) => ({
      id: String(section.id),
      title: String(section.title),
      items: selectItems.all(id, section.id).map((item) => ({
        id: String(item.id),
        name: String(item.name),
        unit: String(item.unit),
        quantity: asNumber(item.quantity),
        unitPrice: asNumber(item.unit_price),
        category: String(item.category)
      }))
    }));

    return {
      id: String(row.id),
      title: String(row.title),
      project: String(row.project),
      customer: String(row.customer),
      region: String(row.region),
      revision: Math.max(1, Math.floor(asNumber(row.revision, 1))),
      status: String(row.status),
      overheadPercent: asNumber(row.overhead_percent),
      profitPercent: asNumber(row.profit_percent),
      vatPercent: asNumber(row.vat_percent),
      sections,
      updatedAt: String(row.updated_at),
      persistence: {
        database: "sqlite",
        ownerId: String(row.owner_id),
        sourceAgentId: row.source_agent_id ? String(row.source_agent_id) : null,
        sourceRequestId: row.source_request_id ? String(row.source_request_id) : null,
        createdAt: String(row.created_at)
      }
    };
  }

  function saveEstimate(estimate, {
    ownerId = "production",
    sourceAgentId = null,
    sourceRequestId = null
  } = {}) {
    const updatedAt = estimate.updatedAt || nowIso();
    const existing = selectCreatedAt.get(estimate.id, ownerId);
    const createdAt = existing?.created_at ? String(existing.created_at) : updatedAt;

    transaction(() => {
      upsertEstimate.run(
        estimate.id,
        ownerId,
        estimate.title,
        estimate.project || "",
        estimate.customer || "",
        estimate.region || "",
        estimate.revision,
        estimate.status,
        estimate.overheadPercent,
        estimate.profitPercent,
        estimate.vatPercent,
        sourceAgentId,
        sourceRequestId,
        createdAt,
        updatedAt
      );
      deleteItems.run(estimate.id);
      deleteSections.run(estimate.id);
      estimate.sections.forEach((section, sectionIndex) => {
        insertSection.run(estimate.id, section.id, sectionIndex, section.title);
        section.items.forEach((item, itemIndex) => {
          insertItem.run(
            estimate.id,
            section.id,
            item.id,
            itemIndex,
            item.name,
            item.unit,
            item.quantity,
            item.unitPrice,
            item.category
          );
        });
      });
    });

    return getEstimate(estimate.id, ownerId);
  }

  function listEstimates(ownerId = "production") {
    return listIds.all(ownerId)
      .map((row) => getEstimate(String(row.id), ownerId))
      .filter(Boolean);
  }

  function close() {
    db.close();
  }

  return {
    databasePath,
    getEstimate,
    saveEstimate,
    listEstimates,
    close
  };
}


function calculateEstimateTotals(estimate) {
  const direct = (estimate?.sections || []).reduce(
    (total, section) => total + (section.items || []).reduce(
      (sectionTotal, item) => sectionTotal + finiteNonNegative(item.quantity) * finiteNonNegative(item.unitPrice),
      0
    ),
    0
  );
  const overhead = direct * finiteNonNegative(estimate?.overheadPercent) / 100;
  const profit = (direct + overhead) * finiteNonNegative(estimate?.profitPercent) / 100;
  const vat = (direct + overhead + profit) * finiteNonNegative(estimate?.vatPercent) / 100;
  return { direct, overhead, profit, vat, total: direct + overhead + profit + vat };
}

const projectStatusOrder = [
  "estimate_draft",
  "estimate_review",
  "estimate_sent",
  "estimate_approved",
  "proposal_ready",
  "contract_ready",
  "contracted",
  "in_progress",
  "completion_review",
  "completed"
];

function projectStatusRank(status) {
  const index = projectStatusOrder.indexOf(String(status));
  return index < 0 ? 0 : index;
}

function projectStatusForEstimate(status) {
  if (status === "review") return "estimate_review";
  if (status === "sent") return "estimate_sent";
  if (status === "approved") return "estimate_approved";
  return "estimate_draft";
}

function normalizeCatalogName(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stableEntityId(prefix, ...parts) {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
  return `${prefix}-${digest}`;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function createWorkflowStore(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_projects (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      customer TEXT NOT NULL,
      region TEXT NOT NULL,
      status TEXT NOT NULL,
      active_estimate_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    DROP INDEX IF EXISTS idx_workflow_project_identity;
    CREATE INDEX IF NOT EXISTS idx_workflow_project_lookup
      ON workflow_projects(owner_id, title, region);
    CREATE INDEX IF NOT EXISTS idx_workflow_projects_updated
      ON workflow_projects(owner_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_projects_estimate
      ON workflow_projects(active_estimate_id);

    CREATE TABLE IF NOT EXISTS estimate_revisions (
      id TEXT PRIMARY KEY,
      estimate_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_estimate_revisions_history
      ON estimate_revisions(estimate_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      estimate_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      number TEXT NOT NULL,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, estimate_id, type, number)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_documents_project
      ON workflow_documents(project_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_workflow_documents_type
      ON workflow_documents(type, updated_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_progress (
      project_id TEXT NOT NULL,
      estimate_id TEXT NOT NULL,
      section_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL,
      planned_quantity REAL NOT NULL,
      actual_quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_progress_project
      ON workflow_progress(project_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS price_observations (
      id TEXT PRIMARY KEY,
      normalized_name TEXT NOT NULL,
      item_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL,
      region TEXT NOT NULL,
      price REAL NOT NULL,
      source_type TEXT NOT NULL,
      source_label TEXT NOT NULL,
      estimate_id TEXT,
      revision INTEGER,
      confidence REAL NOT NULL,
      observed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_price_observations_lookup
      ON price_observations(normalized_name, unit, region, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_price_observations_region
      ON price_observations(region, observed_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_audit (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_audit_entity
      ON workflow_audit(entity_type, entity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS provisioning_nonces (
      nonce TEXT PRIMARY KEY,
      used_at TEXT NOT NULL
    );
  `);

  const selectProject = db.prepare("SELECT * FROM workflow_projects WHERE id = ?");
  const selectProjectByEstimate = db.prepare("SELECT * FROM workflow_projects WHERE active_estimate_id = ? ORDER BY updated_at DESC LIMIT 1");
  const listProjectRows = db.prepare("SELECT * FROM workflow_projects WHERE owner_id = ? ORDER BY updated_at DESC");
  const upsertProject = db.prepare(`
    INSERT INTO workflow_projects (
      id, owner_id, title, customer, region, status, active_estimate_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      customer = excluded.customer,
      region = excluded.region,
      status = excluded.status,
      active_estimate_id = excluded.active_estimate_id,
      updated_at = excluded.updated_at
  `);
  const updateProjectStatusStatement = db.prepare("UPDATE workflow_projects SET status = ?, updated_at = ? WHERE id = ?");
  const selectEstimateSummary = db.prepare(`
    SELECT e.overhead_percent, e.profit_percent, e.vat_percent,
           COALESCE(SUM(i.quantity * i.unit_price), 0) AS direct
      FROM estimates e
      LEFT JOIN estimate_items i ON i.estimate_id = e.id
     WHERE e.id = ?
     GROUP BY e.id
  `);
  const selectProgressSummary = db.prepare(`
    SELECT COUNT(*) AS total_items,
           SUM(CASE WHEN status IN ('done', 'excluded') THEN 1 ELSE 0 END) AS completed_items,
           COALESCE(SUM(actual_quantity * unit_price), 0) AS actual_total
      FROM workflow_progress
     WHERE project_id = ?
  `);
  const upsertProgress = db.prepare(`
    INSERT INTO workflow_progress (
      project_id, estimate_id, section_id, item_id, name, unit, category,
      planned_quantity, actual_quantity, unit_price, status, note, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, item_id) DO UPDATE SET
      estimate_id = excluded.estimate_id,
      section_id = excluded.section_id,
      name = excluded.name,
      unit = excluded.unit,
      category = excluded.category,
      planned_quantity = excluded.planned_quantity,
      unit_price = excluded.unit_price,
      updated_at = excluded.updated_at
  `);
  const selectProgress = db.prepare("SELECT * FROM workflow_progress WHERE project_id = ? ORDER BY rowid ASC");
  const updateProgressStatement = db.prepare(`
    UPDATE workflow_progress
       SET actual_quantity = ?, status = ?, note = ?, updated_at = ?
     WHERE project_id = ? AND item_id = ?
  `);
  const selectProgressItem = db.prepare("SELECT * FROM workflow_progress WHERE project_id = ? AND item_id = ?");
  const insertRevision = db.prepare(`
    INSERT OR IGNORE INTO estimate_revisions (id, estimate_id, revision, event, status, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectRevisions = db.prepare("SELECT * FROM estimate_revisions WHERE estimate_id = ? ORDER BY created_at DESC");
  const upsertDocument = db.prepare(`
    INSERT INTO workflow_documents (
      id, project_id, estimate_id, type, status, number, title, content_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      number = excluded.number,
      title = excluded.title,
      content_json = excluded.content_json,
      updated_at = excluded.updated_at
  `);
  const selectDocument = db.prepare("SELECT * FROM workflow_documents WHERE id = ?");
  const selectDocumentsByProject = db.prepare("SELECT * FROM workflow_documents WHERE project_id = ? ORDER BY updated_at DESC");
  const listDocumentsStatement = db.prepare("SELECT * FROM workflow_documents ORDER BY updated_at DESC");
  const updateDocumentStatusStatement = db.prepare("UPDATE workflow_documents SET status = ?, updated_at = ? WHERE id = ?");
  const upsertPriceObservation = db.prepare(`
    INSERT INTO price_observations (
      id, normalized_name, item_name, unit, category, region, price, source_type,
      source_label, estimate_id, revision, confidence, observed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      item_name = excluded.item_name,
      price = excluded.price,
      confidence = excluded.confidence,
      observed_at = excluded.observed_at
  `);
  const listPriceObservations = db.prepare("SELECT * FROM price_observations ORDER BY observed_at DESC");
  const insertAudit = db.prepare(`
    INSERT INTO workflow_audit (id, entity_type, entity_id, action, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const selectAudit = db.prepare("SELECT * FROM workflow_audit WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 100");
  const findNonce = db.prepare("SELECT nonce FROM provisioning_nonces WHERE nonce = ?");
  const insertNonce = db.prepare("INSERT INTO provisioning_nonces (nonce, used_at) VALUES (?, ?)");

  function transaction(callback) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = callback();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  function audit(entityType, entityId, action, payload = {}) {
    insertAudit.run(randomUUID(), entityType, entityId, action, JSON.stringify(payload), nowIso());
  }

  function projectFromRow(row) {
    if (!row) return null;
    const estimateSummary = selectEstimateSummary.get(row.active_estimate_id) || {};
    const direct = asNumber(estimateSummary.direct);
    const overhead = direct * asNumber(estimateSummary.overhead_percent) / 100;
    const profit = (direct + overhead) * asNumber(estimateSummary.profit_percent) / 100;
    const vat = (direct + overhead + profit) * asNumber(estimateSummary.vat_percent) / 100;
    const estimateTotal = direct + overhead + profit + vat;
    const progressSummary = selectProgressSummary.get(row.id) || {};
    const totalItems = Math.max(0, Math.floor(asNumber(progressSummary.total_items)));
    const completedItems = Math.max(0, Math.floor(asNumber(progressSummary.completed_items)));
    return {
      id: String(row.id),
      title: String(row.title),
      customer: String(row.customer),
      region: String(row.region),
      status: String(row.status),
      activeEstimateId: String(row.active_estimate_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      totals: {
        estimate: estimateTotal,
        planned: estimateTotal,
        actual: asNumber(progressSummary.actual_total)
      },
      progress: {
        completedItems,
        totalItems,
        percent: totalItems ? Math.round(completedItems / totalItems * 100) : 0
      }
    };
  }

  function ensureProject(estimate, { status = null, forceStatus = false } = {}) {
    const ownerId = estimate.persistence?.ownerId || "production";
    const title = String(estimate.project || estimate.title || "Объект без названия").trim();
    const region = String(estimate.region || "").trim();
    const customer = String(estimate.customer || "").trim();
    const existing = selectProjectByEstimate.get(estimate.id);
    const id = existing?.id || stableEntityId("project", ownerId, estimate.id, title, region);
    const createdAt = existing?.created_at || nowIso();
    const requestedStatus = status || projectStatusForEstimate(estimate.status);
    const currentStatus = existing?.status || "estimate_draft";
    const nextStatus = forceStatus || projectStatusRank(requestedStatus) >= projectStatusRank(currentStatus)
      ? requestedStatus
      : currentStatus;
    const updatedAt = nowIso();
    upsertProject.run(id, ownerId, title, customer, region, nextStatus, estimate.id, createdAt, updatedAt);
    for (const section of estimate.sections || []) {
      for (const item of section.items || []) {
        upsertProgress.run(
          id,
          estimate.id,
          section.id,
          item.id,
          item.name,
          item.unit,
          item.category,
          finiteNonNegative(item.quantity),
          0,
          finiteNonNegative(item.unitPrice),
          "planned",
          "",
          updatedAt
        );
      }
    }
    return projectFromRow(selectProject.get(id));
  }

  function setProjectStatus(projectId, status) {
    if (!projectStatusOrder.includes(status)) throw new Error("Некорректный статус проекта");
    const current = selectProject.get(projectId);
    if (!current) throw new Error("Проект не найден");
    if (projectStatusRank(status) < projectStatusRank(current.status) && status !== "estimate_review") {
      throw new Error("Нельзя перевести проект на предыдущий этап");
    }
    updateProjectStatusStatement.run(status, nowIso(), projectId);
    audit("project", projectId, `status:${status}`);
    return projectFromRow(selectProject.get(projectId));
  }

  function recordRevision(estimate, event) {
    const createdAt = nowIso();
    const id = stableEntityId("revision", estimate.id, String(estimate.revision), event);
    insertRevision.run(id, estimate.id, estimate.revision, event, estimate.status, JSON.stringify(estimate), createdAt);
    audit("estimate", estimate.id, event, { revision: estimate.revision, status: estimate.status });
    return id;
  }

  function revisions(estimateId) {
    return selectRevisions.all(estimateId).map((row) => ({
      id: String(row.id),
      estimateId: String(row.estimate_id),
      revision: Math.max(1, Math.floor(asNumber(row.revision, 1))),
      event: String(row.event),
      status: String(row.status),
      snapshot: JSON.parse(String(row.snapshot_json)),
      createdAt: String(row.created_at)
    }));
  }

  function observePrices(estimate, sourceType, sourceLabel = "", confidence = 0.7) {
    const observedAt = nowIso();
    for (const section of estimate.sections || []) {
      for (const item of section.items || []) {
        if (!item.name || !item.unit || finiteNonNegative(item.unitPrice) <= 0) continue;
        const normalizedName = normalizeCatalogName(item.name);
        const id = stableEntityId(
          "price",
          estimate.id,
          String(estimate.revision),
          item.id,
          sourceType,
          estimate.region || ""
        );
        upsertPriceObservation.run(
          id,
          normalizedName,
          item.name,
          item.unit,
          item.category,
          estimate.region || "",
          finiteNonNegative(item.unitPrice),
          sourceType,
          sourceLabel || sourceType,
          estimate.id,
          estimate.revision,
          Math.min(1, Math.max(0, Number(confidence) || 0)),
          observedAt,
          observedAt
        );
      }
    }
  }

  function priceCatalog({ query = "", region = "", limit = 200 } = {}) {
    const normalizedQuery = normalizeCatalogName(query);
    const words = normalizedQuery.split(" ").filter((word) => word.length > 2);
    const normalizedRegion = String(region || "").trim().toLowerCase();
    const groups = new Map();
    for (const row of listPriceObservations.all()) {
      if (normalizedRegion && String(row.region).toLowerCase() !== normalizedRegion) continue;
      const haystack = `${row.normalized_name} ${String(row.item_name).toLowerCase()}`;
      if (words.length && !words.some((word) => haystack.includes(word))) continue;
      const key = `${row.normalized_name}\u0000${row.unit}\u0000${row.region}`;
      const group = groups.get(key) || { rows: [], latest: row };
      group.rows.push(row);
      if (String(row.observed_at) > String(group.latest.observed_at)) group.latest = row;
      groups.set(key, group);
    }
    return [...groups.values()]
      .map(({ rows, latest }) => {
        const prices = rows.map((row) => asNumber(row.price)).filter((price) => price > 0);
        const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
        const averageConfidence = rows.reduce((sum, row) => sum + asNumber(row.confidence), 0) / Math.max(1, rows.length);
        return {
          normalizedName: String(latest.normalized_name),
          name: String(latest.item_name),
          unit: String(latest.unit),
          category: String(latest.category),
          region: String(latest.region),
          averagePrice,
          medianPrice: median(prices),
          minimumPrice: prices.length ? Math.min(...prices) : 0,
          maximumPrice: prices.length ? Math.max(...prices) : 0,
          latestPrice: asNumber(latest.price),
          sampleCount: rows.length,
          latestObservedAt: String(latest.observed_at),
          confidence: Math.min(1, Math.max(0, averageConfidence))
        };
      })
      .sort((left, right) => Date.parse(right.latestObservedAt) - Date.parse(left.latestObservedAt))
      .slice(0, Math.min(500, Math.max(1, Number(limit) || 200)));
  }

  function priceContext(query, region, limit = 24) {
    const entries = priceCatalog({ query, region, limit });
    if (!entries.length) return "Локальный справочник цен пока не содержит сопоставимых подтверждённых позиций.";
    return [
      "Сопоставимые цены из локального справочника ProSmet. Это ориентиры, их нужно сверить с текущими коммерческими предложениями:",
      ...entries.map((entry) => [
        `- ${entry.name}: медиана ${Math.round(entry.medianPrice)} ₽/${entry.unit}`,
        `средняя ${Math.round(entry.averagePrice)} ₽/${entry.unit}`,
        `выборка ${entry.sampleCount}`,
        entry.region ? `регион ${entry.region}` : "регион не указан",
        `дата ${entry.latestObservedAt.slice(0, 10)}`
      ].join(", "))
    ].join("\n");
  }

  function documentFromRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      estimateId: String(row.estimate_id),
      type: String(row.type),
      status: String(row.status),
      number: String(row.number),
      title: String(row.title),
      content: JSON.parse(String(row.content_json)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  function saveDocument({ projectId, estimateId, type, status = "ready", number, title, content }) {
    const id = stableEntityId("document", projectId, estimateId, type, number);
    const existing = selectDocument.get(id);
    const createdAt = existing?.created_at || nowIso();
    const updatedAt = nowIso();
    upsertDocument.run(
      id,
      projectId,
      estimateId,
      type,
      status,
      number,
      title,
      JSON.stringify(content),
      createdAt,
      updatedAt
    );
    audit("document", id, `document:${type}:${status}`, { projectId, estimateId });
    return documentFromRow(selectDocument.get(id));
  }

  function document(id) {
    return documentFromRow(selectDocument.get(id));
  }

  function documents(projectId = null) {
    const rows = projectId ? selectDocumentsByProject.all(projectId) : listDocumentsStatement.all();
    return rows.map(documentFromRow);
  }

  function setDocumentStatus(id, status) {
    if (!new Set(["draft", "ready", "sent", "signed", "approved"]).has(status)) {
      throw new Error("Некорректный статус документа");
    }
    if (!selectDocument.get(id)) throw new Error("Документ не найден");
    updateDocumentStatusStatement.run(status, nowIso(), id);
    audit("document", id, `status:${status}`);
    return documentFromRow(selectDocument.get(id));
  }

  function progressFromRow(row) {
    return {
      projectId: String(row.project_id),
      estimateId: String(row.estimate_id),
      sectionId: String(row.section_id),
      itemId: String(row.item_id),
      name: String(row.name),
      unit: String(row.unit),
      category: String(row.category),
      plannedQuantity: asNumber(row.planned_quantity),
      actualQuantity: asNumber(row.actual_quantity),
      unitPrice: asNumber(row.unit_price),
      status: String(row.status),
      note: String(row.note),
      updatedAt: String(row.updated_at)
    };
  }

  function progress(projectId) {
    return selectProgress.all(projectId).map(progressFromRow);
  }

  function updateProgress(projectId, itemId, patch) {
    const existing = selectProgressItem.get(projectId, itemId);
    if (!existing) throw new Error("Позиция выполнения не найдена");
    const status = new Set(["planned", "started", "done", "excluded"]).has(patch.status)
      ? patch.status
      : String(existing.status);
    const actualQuantity = finiteNonNegative(patch.actualQuantity, asNumber(existing.actual_quantity));
    const note = optionalString(patch.note, 2000) || "";
    updateProgressStatement.run(actualQuantity, status, note, nowIso(), projectId, itemId);
    audit("project", projectId, "progress:update", { itemId, actualQuantity, status, note });
    return progressFromRow(selectProgressItem.get(projectId, itemId));
  }

  function project(projectId) {
    return projectFromRow(selectProject.get(projectId));
  }

  function projectByEstimate(estimateId) {
    return projectFromRow(selectProjectByEstimate.get(estimateId));
  }

  function projects(ownerId = "production") {
    return listProjectRows.all(ownerId).map(projectFromRow);
  }

  function workflow(estimate) {
    const linkedProject = ensureProject(estimate);
    return {
      project: linkedProject,
      estimate,
      revisions: revisions(estimate.id),
      documents: documents(linkedProject.id),
      progress: progress(linkedProject.id),
      audit: selectAudit.all("project", linkedProject.id).map((row) => ({
        id: String(row.id),
        action: String(row.action),
        payload: JSON.parse(String(row.payload_json)),
        createdAt: String(row.created_at)
      }))
    };
  }

  function useProvisioningNonce(nonce) {
    if (!nonce || findNonce.get(nonce)) return false;
    insertNonce.run(nonce, nowIso());
    return true;
  }

  function close() {
    db.close();
  }

  return {
    audit,
    close,
    document,
    documents,
    ensureProject,
    observePrices,
    priceCatalog,
    priceContext,
    progress,
    project,
    projectByEstimate,
    projects,
    recordRevision,
    revisions,
    saveDocument,
    setDocumentStatus,
    setProjectStatus,
    updateProgress,
    useProvisioningNonce,
    workflow
  };
}

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT || 3200);
const releaseSha = process.env.PROSMET_RELEASE_SHA || "development";
const configRoot = process.env.PROSMET_CONFIG_DIR || join(homedir(), ".prosmet-greenfield", "config");
const registryFile = join(configRoot, "agents.json");
const registryTempFile = join(configRoot, "agents.json.tmp");
const keyFile = join(configRoot, "agents.key");
const adminTokenFile = join(configRoot, "admin.token");
const provisioningPrivateKeyFile = join(configRoot, "qwen-provisioning-private.pem");
const provisioningPublicKeyFile = join(configRoot, "qwen-provisioning-public.pem");
const qwenProvisionedFile = join(configRoot, "qwen-provisioned.json");
const expectedQwenKeySha256 = process.env.PROSMET_QWEN_KEY_SHA256?.trim() || "";
const estimateDatabaseFile = process.env.PROSMET_DATABASE_PATH || join(configRoot, "prosmet.sqlite");
const estimateStore = createEstimateStore(estimateDatabaseFile);
const workflowStore = createWorkflowStore(estimateDatabaseFile);
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
const publicAgentAccess = process.env.PROSMET_PUBLIC_AGENT_ACCESS === "true";
const maxBodyBytes = 2 * 1024 * 1024;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8"
};

const providerKinds = new Set([
  "openai-compatible",
  "ollama",
  "codex-app-server",
  "http-agent"
]);

const estimateSchema = {
  type: "object",
  properties: {
    text: { type: "string" },
    artifact: { type: ["string", "null"], enum: ["estimate", null] },
    estimate: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            project: { type: "string" },
            customer: { type: "string" },
            region: { type: "string" },
            revision: { type: "number" },
            status: { type: "string", enum: ["draft", "review", "approved", "sent"] },
            overheadPercent: { type: "number" },
            profitPercent: { type: "number" },
            vatPercent: { type: "number" },
            updatedAt: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        unit: { type: "string" },
                        quantity: { type: "number" },
                        unitPrice: { type: "number" },
                        category: {
                          type: "string",
                          enum: ["work", "material", "equipment", "logistics"]
                        }
                      },
                      required: ["id", "name", "unit", "quantity", "unitPrice", "category"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["id", "title", "items"],
                additionalProperties: false
              }
            }
          },
          required: [
            "id",
            "title",
            "project",
            "customer",
            "region",
            "revision",
            "status",
            "overheadPercent",
            "profitPercent",
            "vatPercent",
            "updatedAt",
            "sections"
          ],
          additionalProperties: false
        }
      ]
    }
  },
  required: ["text", "artifact", "estimate"],
  additionalProperties: false
};

const systemInstructions = [
  "Ты — главный агент-сметчик ProSmet, профессиональной системы управления строительным проектом в России.",
  "Работай только в строительной и ремонтной тематике. На обычное приветствие или общую беседу отвечай текстом и никогда не создавай смету.",
  "Отвечай ровно одним JSON-объектом с полями text, artifact и estimate. artifact может быть только null или строкой estimate.",
  "Создавай artifact estimate только когда пользователь явно просит смету, расчёт стоимости, бюджет или расходы по строительным работам.",
  "Если пользователь задаёт строительный вопрос, но не просит расчёт, дай полезный ответ в text, а artifact и estimate оставь null.",
  "Перед расчётом проверь критически важные исходные данные: объект, регион, объём или размеры, состав работ, уровень материалов и особые условия.",
  "Не превращай уточнение в анкету: за один ответ спрашивай только то, без чего результат будет существенно недостоверен.",
  "Если данных достаточно, сначала внутренне сформируй технологическую карту: последовательность операций, подготовку, материалы, механизмы, контроль качества, безопасность и условия выполнения.",
  "Смета должна охватывать применимые работы, материалы, оборудование, доставку, погрузку, вывоз и сопутствующие операции; не добавляй категории, которые реально не нужны.",
  "Для цен используй свежие коммерческие ориентиры указанного региона и переданный локальный справочник ProSmet. Сравни источники, отмечай допущения в text и не выдавай рыночный ориентир за обязательную государственную цену.",
  "Учитывай применимые действующие технические регламенты, Градостроительный кодекс РФ, СП, СНиП и ГОСТ. Не придумывай номер или обязательность документа: при сомнении явно укажи необходимость проверки актуальной редакции.",
  "Количество, единица измерения и цена каждой позиции должны быть осмысленными; все числа должны быть конечными и неотрицательными.",
  "Обычная полноценная смета должна содержать не менее трёх содержательных позиций и разделять работы и материалы, когда оба вида затрат применимы.",
  "Если пользователь прямо просит минимальный черновик или тестовый минимальный расчёт, допустим один раздел с одной–тремя прозрачными позициями.",
  "Не используй демонстрационные названия, фиксированные идентификаторы вроде draft-001 и вымышленные данные клиента. Для id используй переданный requestId или уникальный нейтральный идентификатор.",
  "Если данных недостаточно, задай конкретный вопрос в text, а artifact и estimate оставь null. Пустую или нулевую смету не возвращай.",
  "Когда смета готова, сервер сохранит её в базе, создаст проект и откроет интерактивный редактор; не описывай несуществующие действия интерфейса.",
  `Строго соблюдай JSON-схему: ${JSON.stringify(estimateSchema)}`
].join("\n");

const greetingPattern = /^(?:привет|здравствуй(?:те)?|доброе\s+(?:утро|день|вечер)|добрый\s+(?:день|вечер)|hello|hi|hey|спасибо|благодарю|как\s+дела)[!.?\s]*$/iu;
const estimateIntentPattern = /(?:смет|рассч(?:итай|итать|ёт)|калькуляц|бюджет|стоимост|расход|сколько\s+(?:стоит|будет)|цена\s+под\s+ключ)/iu;
const constructionPattern = /(?:строит|ремонт|отделк|ванн|сануз|квартир|дом|коттедж|фундамент|бетон|кладк|кирпич|газобетон|штукатур|шпакл|плитк|стяжк|пол|потол|кровл|фасад|электрик|сантех|отоплен|вентиляц|водоснаб|канализац|монтаж|демонтаж|инженерн|окн|двер|утеплен|малярн|землян|свайн|перекрыт|лестниц|забор|благоустрой)/iu;
const documentIntentPattern = /(?:договор|сч[её]т|акт\s+выполн|кс-?2|кс-?3|коммерческ(?:ое|ую)\s+предложен|документ)/iu;
const minimalDraftPattern = /(?:минимальн|черновик|тестов(?:ый|ая)|одн(?:а|ой)\s+позиц)/iu;

function latestUserText(messages) {
  const normalized = normalizeMessages(messages);
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index].role === "user") return normalized[index].content.trim();
  }
  return "";
}

function classifyRequest(messages) {
  const text = latestUserText(messages);
  if (!text || greetingPattern.test(text)) {
    return { kind: "greeting", text, allowEstimate: false, constructionRelated: false, enablePriceResearch: false, minimalDraft: false };
  }
  const estimateRequested = estimateIntentPattern.test(text);
  const constructionRelated = constructionPattern.test(text) || estimateRequested;
  const asksDocuments = documentIntentPattern.test(text) && !estimateRequested;
  if (estimateRequested) {
    return { kind: "estimate", text, allowEstimate: true, constructionRelated, enablePriceResearch: true, minimalDraft: minimalDraftPattern.test(text) };
  }
  if (asksDocuments) {
    return { kind: "documents", text, allowEstimate: false, constructionRelated: true, enablePriceResearch: false, minimalDraft: false };
  }
  if (constructionRelated) {
    return { kind: "construction", text, allowEstimate: false, constructionRelated: true, enablePriceResearch: false, minimalDraft: false };
  }
  return { kind: "general", text, allowEstimate: false, constructionRelated: false, enablePriceResearch: false, minimalDraft: false };
}

function composeSystemPrompt(agent, context = {}) {
  const parts = [systemInstructions];
  if (context.intent) {
    parts.push(`Сервер классифицировал текущий запрос как ${context.intent.kind}. Создание сметы ${context.intent.allowEstimate ? "разрешено" : "запрещено"}.`);
    if (context.intent.allowEstimate && context.requestId) {
      parts.push(`Используй уникальный id сметы estimate-${context.requestId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.`);
    }
  }
  if (context.priceContext) parts.push(context.priceContext);
  if (agent?.systemPrompt) parts.push(`Дополнительные инструкции владельца приложения (не отменяют правила выше):\n${agent.systemPrompt}`);
  return parts.join("\n\n");
}

function estimateQualityIssues(estimate, { minimalDraft = false } = {}) {
  if (!estimate) return ["estimate_missing"];
  const items = estimate.sections.flatMap((section) => section.items || []);
  const issues = [];
  if (!estimate.title.trim()) issues.push("title_missing");
  if (!estimate.project.trim()) issues.push("project_missing");
  if (!estimate.region.trim()) issues.push("region_missing");
  if (!minimalDraft && items.length < 3) issues.push("too_few_items");
  if (!items.length) issues.push("items_missing");
  if (items.some((item) => !item.name.trim() || !item.unit.trim())) issues.push("invalid_item");
  if (items.every((item) => finiteNonNegative(item.unitPrice) <= 0)) issues.push("prices_missing");
  if (!minimalDraft) {
    const categories = new Set(items.map((item) => item.category));
    if (categories.has("work") && !categories.has("material") && /(?:ремонт|отделк|под\s+ключ|строит)/iu.test(estimate.title)) {
      issues.push("materials_missing");
    }
  }
  return issues;
}

let encryptionKeyPromise;
let adminTokenPromise;
let registryQueue = Promise.resolve();
const codexClients = new Map();

function sendJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, code, message, details) {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    }
  });
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("Request body is too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const raw = await readBody(request);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

async function ensureConfigRoot() {
  await mkdir(configRoot, { recursive: true, mode: 0o700 });
  await chmod(configRoot, 0o700).catch(() => undefined);
}

async function getEncryptionKey() {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      await ensureConfigRoot();
      try {
        const existing = await readFile(keyFile);
        if (existing.length !== 32) throw new Error("Invalid encryption key length");
        return existing;
      } catch (error) {
        if (error?.code && error.code !== "ENOENT") throw error;
        const key = randomBytes(32);
        await writeFile(keyFile, key, { mode: 0o600, flag: "wx" }).catch(async (writeError) => {
          if (writeError?.code !== "EEXIST") throw writeError;
        });
        const persisted = await readFile(keyFile);
        if (persisted.length !== 32) throw new Error("Invalid persisted encryption key length");
        return persisted;
      }
    })();
  }
  return encryptionKeyPromise;
}

async function getAdminToken() {
  if (!adminTokenPromise) {
    adminTokenPromise = (async () => {
      const configured = process.env.PROSMET_ADMIN_TOKEN?.trim();
      if (configured) return configured;
      await ensureConfigRoot();
      try {
        const existing = (await readFile(adminTokenFile, "utf8")).trim();
        if (existing.length < 24) throw new Error("Persisted admin token is invalid");
        return existing;
      } catch (error) {
        if (error?.code && error.code !== "ENOENT") throw error;
        const token = randomBytes(32).toString("base64url");
        await writeFile(adminTokenFile, `${token}\n`, { mode: 0o600, flag: "wx" }).catch(async (writeError) => {
          if (writeError?.code !== "EEXIST") throw writeError;
        });
        return (await readFile(adminTokenFile, "utf8")).trim();
      }
    })();
  }
  return adminTokenPromise;
}

async function encryptSecret(value) {
  if (!value) return null;
  const key = await getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

async function decryptSecret(value) {
  if (!value) return null;
  const [version, ivValue, tagValue, encryptedValue] = String(value).split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted secret format");
  }
  const key = await getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function emptyRegistry() {
  return {
    version: 1,
    activeAgentId: null,
    agents: [],
    profile: null
  };
}

async function loadRegistry() {
  await ensureConfigRoot();
  try {
    const parsed = JSON.parse(await readFile(registryFile, "utf8"));
    return {
      version: 1,
      activeAgentId: typeof parsed.activeAgentId === "string" ? parsed.activeAgentId : null,
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null
    };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

async function saveRegistry(registry) {
  await ensureConfigRoot();
  await writeFile(registryTempFile, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  await rename(registryTempFile, registryFile);
  await chmod(registryFile, 0o600).catch(() => undefined);
}

function mutateRegistry(mutator) {
  const operation = registryQueue.catch(() => undefined).then(async () => {
    const registry = await loadRegistry();
    const result = await mutator(registry);
    await saveRegistry(registry);
    return result;
  });
  registryQueue = operation;
  return operation;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValue(request, name) {
  const header = request.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

async function createAdminSession() {
  const key = await getEncryptionKey();
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function verifyAdminSession(value) {
  if (!value) return false;
  const [payload, signature] = String(value).split(".");
  if (!payload || !signature) return false;
  const key = await getEncryptionKey();
  const expected = createHmac("sha256", key).update(payload).digest("base64url");
  if (!constantTimeEqual(signature, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(decoded.exp) > Date.now();
  } catch {
    return false;
  }
}

async function isAdmin(request) {
  const expected = await getAdminToken();
  const headerToken = request.headers["x-prosmet-admin-token"];
  if (typeof headerToken === "string" && constantTimeEqual(headerToken.trim(), expected)) return true;
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    if (constantTimeEqual(authorization.slice(7).trim(), expected)) return true;
  }
  return verifyAdminSession(cookieValue(request, "prosmet_admin_session"));
}

async function requireAdmin(request, response) {
  if (await isAdmin(request)) return true;
  sendError(response, 401, "ADMIN_REQUIRED", "Требуется сессия супер-администратора.");
  return false;
}

function sanitizeAgent(agent, activeAgentId) {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    enabled: agent.enabled !== false,
    active: agent.id === activeAgentId,
    model: agent.model || null,
    baseUrl: agent.baseUrl || null,
    command: agent.command || null,
    args: Array.isArray(agent.args) ? agent.args : [],
    cwd: agent.cwd || null,
    systemPrompt: agent.systemPrompt || null,
    timeoutMs: Number(agent.timeoutMs) || 180000,
    hasSecret: Boolean(agent.secretCipher),
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

function normalizeUrl(value, field) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) throw new Error(`${field} обязателен`);
  const url = new URL(text);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`${field} должен использовать http или https`);
  }
  return url.toString().replace(/\/+$/, "");
}

function optionalString(value, maxLength = 4000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

async function normalizeAgentInput(input, existing = null) {
  if (!input || typeof input !== "object") throw new Error("Agent configuration is required");
  const type = String(input.type || existing?.type || "");
  if (!providerKinds.has(type)) throw new Error("Unsupported agent provider type");
  const name = String(input.name || existing?.name || "").trim().slice(0, 80);
  if (!name) throw new Error("Название агента обязательно");

  const agent = {
    id: existing?.id || randomUUID(),
    name,
    type,
    enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
    model: optionalString(input.model ?? existing?.model, 160),
    baseUrl: null,
    command: null,
    args: [],
    cwd: optionalString(input.cwd ?? existing?.cwd, 1000),
    systemPrompt: optionalString(input.systemPrompt ?? existing?.systemPrompt, 12000),
    timeoutMs: Math.min(600000, Math.max(5000, Number(input.timeoutMs ?? existing?.timeoutMs ?? 180000))),
    secretCipher: existing?.secretCipher || null,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (type === "codex-app-server") {
    agent.command = optionalString(input.command ?? existing?.command, 500) || "codex";
    const args = input.args ?? existing?.args ?? ["app-server", "--listen", "stdio://"];
    if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string")) {
      throw new Error("Аргументы Codex должны быть массивом строк");
    }
    agent.args = args.slice(0, 24).map((entry) => entry.slice(0, 500));
  } else {
    agent.baseUrl = normalizeUrl(input.baseUrl ?? existing?.baseUrl, "URL агента");
    if (type !== "http-agent" && !agent.model) throw new Error("Модель обязательна");
  }

  if (Object.prototype.hasOwnProperty.call(input, "secret")) {
    agent.secretCipher = await encryptSecret(optionalString(input.secret, 12000));
  }

  return agent;
}

function textFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part.text === "string") return part.text;
    return "";
  }).filter(Boolean).join("\n");
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    role: new Set(["user", "assistant", "system"]).has(message?.role) ? message.role : "user",
    content: textFromContent(message?.content)
  })).filter((message) => message.content.trim());
}

function conversationPrompt(messages) {
  return normalizeMessages(messages)
    .map((message) => `${message.role === "user" ? "Пользователь" : message.role === "assistant" ? "Ассистент" : "Система"}: ${message.content}`)
    .join("\n\n");
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function validateEstimate(value) {
  if (!value || typeof value !== "object") return null;
  const sections = Array.isArray(value.sections) ? value.sections.map((section, sectionIndex) => {
    if (!section || typeof section !== "object") return null;
    const items = Array.isArray(section.items) ? section.items.map((item, itemIndex) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const unit = String(item.unit || "").trim();
      const category = new Set(["work", "material", "equipment", "logistics"]).has(item.category)
        ? item.category
        : "work";
      if (!name || !unit) return null;
      return {
        id: String(item.id || `item-${sectionIndex + 1}-${itemIndex + 1}`),
        name,
        unit,
        quantity: finiteNonNegative(item.quantity),
        unitPrice: finiteNonNegative(item.unitPrice),
        category
      };
    }).filter(Boolean) : [];
    const title = String(section.title || "").trim();
    if (!title || items.length === 0) return null;
    return {
      id: String(section.id || `section-${sectionIndex + 1}`),
      title,
      items
    };
  }).filter(Boolean) : [];

  if (sections.length === 0) return null;
  const title = String(value.title || "").trim();
  if (!title) return null;
  const status = new Set(["draft", "review", "approved", "sent"]).has(value.status) ? value.status : "draft";
  return {
    id: String(value.id || randomUUID()),
    title,
    project: String(value.project || "").trim(),
    customer: String(value.customer || "").trim(),
    region: String(value.region || "").trim(),
    revision: Math.max(1, Math.floor(finiteNonNegative(value.revision, 1))),
    status,
    overheadPercent: finiteNonNegative(value.overheadPercent),
    profitPercent: finiteNonNegative(value.profitPercent),
    vatPercent: finiteNonNegative(value.vatPercent),
    sections,
    updatedAt: new Date().toISOString()
  };
}

function extractJsonObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw || "").trim();
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(unfenced.slice(start, end + 1)); } catch {}
    }
  }
  return null;
}

function parseAgentEnvelope(raw) {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    const text = String(raw || "").trim();
    if (!text) throw new Error("Агент вернул пустой ответ");
    return { text };
  }
  const text = String(parsed.text || parsed.message || parsed.output || "").trim();
  const estimate = validateEstimate(parsed.estimate);
  if (parsed.artifact === "estimate" && estimate) {
    return { text: text || "Смета подготовлена.", artifact: "estimate", estimate };
  }
  if (!text) throw new Error("Ответ агента не содержит текста или валидной сметы");
  return { text };
}

function endpointFor(baseUrl, suffix) {
  const clean = baseUrl.replace(/\/+$/, "");
  if (clean.endsWith(suffix)) return clean;
  return `${clean}/${suffix.replace(/^\/+/, "")}`;
}

function createLinkedAbortSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Agent request timed out")), timeoutMs);
  const onAbort = () => controller.abort(externalSignal.reason || new Error("Agent request aborted"));
  externalSignal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  };
}

async function fetchJson(url, options, timeoutMs, externalSignal) {
  const linked = createLinkedAbortSignal(externalSignal, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: linked.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const detail = typeof body === "string" ? body.slice(0, 1000) : body;
      const error = new Error(`Upstream agent returned HTTP ${response.status}`);
      error.details = detail;
      throw error;
    }
    return body;
  } finally {
    linked.dispose();
  }
}

async function callOpenAICompatible(agent, messages, signal, context = {}) {
  const secret = await decryptSecret(agent.secretCipher);
  const model = String(agent.model || "").trim();
  const isMimoV25 = /^mimo-v2\.5(?:-|$)/i.test(model);
  const isQwen = /^qwen(?:-|$)/i.test(model) || /(?:dashscope|aliyuncs|qwen)/i.test(String(agent.baseUrl || ""));
  const systemPrompt = composeSystemPrompt(agent, context);
  const basePayload = {
    model: agent.model,
    messages: [
      { role: "system", content: systemPrompt },
      ...normalizeMessages(messages)
    ],
    temperature: 0.1,
    ...(isMimoV25 ? {
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_completion_tokens: 8192
    } : {}),
    ...(isQwen ? {
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
      ...(context.intent?.enablePriceResearch ? {
        enable_search: true,
        search_options: { search_strategy: "agent" }
      } : {})
    } : {})
  };

  const run = (payload) => fetchJson(
    endpointFor(agent.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify(payload)
    },
    agent.timeoutMs,
    signal
  );

  let result;
  try {
    result = await run(basePayload);
  } catch (error) {
    if (!isQwen || !basePayload.enable_search) throw error;
    const fallbackPayload = { ...basePayload };
    delete fallbackPayload.enable_search;
    delete fallbackPayload.search_options;
    result = await run(fallbackPayload);
  }
  const content = result?.choices?.[0]?.message?.content;
  return parseAgentEnvelope(content);
}

async function callOllama(agent, messages, signal, context = {}) {
  const secret = await decryptSecret(agent.secretCipher);
  const result = await fetchJson(
    endpointFor(agent.baseUrl, "api/chat"),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [
          { role: "system", content: composeSystemPrompt(agent, context) },
          ...normalizeMessages(messages)
        ],
        stream: false,
        format: "json",
        options: { temperature: 0.1 }
      })
    },
    agent.timeoutMs,
    signal
  );
  return parseAgentEnvelope(result?.message?.content ?? result?.response);
}

async function callHttpAgent(agent, messages, signal, context = {}) {
  const secret = await decryptSecret(agent.secretCipher);
  const result = await fetchJson(
    agent.baseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {})
      },
      body: JSON.stringify({
        messages: normalizeMessages(messages),
        instructions: composeSystemPrompt(agent, context),
        responseSchema: estimateSchema,
        context: {
          application: "prosmet-greenfield",
          releaseSha,
          intent: context.intent?.kind || "general",
          allowEstimate: Boolean(context.intent?.allowEstimate),
          priceResearch: Boolean(context.intent?.enablePriceResearch)
        }
      })
    },
    agent.timeoutMs,
    signal
  );
  return parseAgentEnvelope(result);
}

function agentMessageText(item) {
  if (!item || typeof item !== "object") return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.message === "string") return item.message;
  if (Array.isArray(item.content)) return textFromContent(item.content);
  return "";
}

class CodexAppServerClient {
  constructor(agent, secret) {
    this.agent = agent;
    this.secret = secret;
    this.child = null;
    this.pending = new Map();
    this.listeners = new Set();
    this.nextId = 1;
    this.ready = null;
    this.stderr = [];
    this.queue = Promise.resolve();
  }

  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const env = { ...process.env };
      if (this.secret) env.OPENAI_API_KEY = this.secret;
      this.child = spawn(this.agent.command || "codex", this.agent.args || ["app-server", "--listen", "stdio://"], {
        cwd: this.agent.cwd || process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false
      });
      this.child.once("error", (error) => this.failAll(error));
      this.child.once("exit", (code, signal) => {
        this.failAll(new Error(`Codex App Server exited (${code ?? "null"}/${signal ?? "none"})`));
        this.child = null;
        this.ready = null;
      });
      createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
      createInterface({ input: this.child.stderr }).on("line", (line) => {
        this.stderr.push(line);
        if (this.stderr.length > 80) this.stderr.shift();
      });
      await this.request("initialize", {
        clientInfo: {
          name: "prosmet_greenfield",
          title: "Prosmet Greenfield",
          version: "1.0.0"
        }
      }, 30000);
      this.notify("initialized", {});
    })();
    return this.ready;
  }

  write(message) {
    if (!this.child?.stdin?.writable) throw new Error("Codex App Server is not writable");
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}, timeoutMs = this.agent.timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(String(id));
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(String(id), {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); }
      });
      this.write({ method, id, params });
    });
  }

  notify(method, params = {}) {
    this.write({ method, params });
  }

  handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message || "Codex request failed"));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.write({
        id: message.id,
        error: { code: -32601, message: "Interactive requests are disabled for this integration" }
      });
      return;
    }
    if (message.method) {
      for (const listener of this.listeners) listener(message);
    }
  }

  failAll(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  onEvent(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  run(messages, signal, context = {}) {
    const operation = this.queue.catch(() => undefined).then(() => this.runInternal(messages, signal, context));
    this.queue = operation;
    return operation;
  }

  async runInternal(messages, signal, context = {}) {
    await this.start();
    const threadParams = {
      ephemeral: true,
      approvalPolicy: "never",
      sandbox: "readOnly",
      ...(this.agent.model ? { model: this.agent.model } : {}),
      ...(this.agent.cwd ? { cwd: this.agent.cwd } : {})
    };
    const threadResult = await this.request("thread/start", threadParams);
    const threadId = threadResult?.thread?.id;
    if (!threadId) throw new Error("Codex did not return a thread id");

    let turnId = null;
    let accumulated = "";
    let completedItem = "";
    let completionResolve;
    let completionReject;
    const completion = new Promise((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    const unsubscribe = this.onEvent((event) => {
      const params = event.params || {};
      if (params.threadId && params.threadId !== threadId) return;
      if (turnId && params.turnId && params.turnId !== turnId) return;
      if (event.method === "item/agentMessage/delta" && typeof params.delta === "string") {
        accumulated += params.delta;
      }
      if (event.method === "item/completed" && params.item?.type === "agentMessage") {
        completedItem = agentMessageText(params.item) || completedItem;
      }
      if (event.method === "turn/completed") {
        const turn = params.turn || {};
        if (turnId && turn.id && turn.id !== turnId) return;
        if (turn.status === "failed") {
          completionReject(new Error(turn.error?.message || "Codex turn failed"));
        } else if (turn.status === "interrupted") {
          completionReject(new Error("Codex turn was interrupted"));
        } else {
          completionResolve(turn);
        }
      }
    });

    const abort = async () => {
      if (!turnId) return;
      try { await this.request("turn/interrupt", { threadId, turnId }, 10000); } catch {}
    };
    signal?.addEventListener("abort", abort, { once: true });

    try {
      const prompt = `${composeSystemPrompt(this.agent, context)}\n\n${conversationPrompt(messages)}`;
      const turnResult = await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: prompt }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly" },
        outputSchema: estimateSchema,
        ...(this.agent.model ? { model: this.agent.model } : {})
      });
      turnId = turnResult?.turn?.id;
      if (!turnId) throw new Error("Codex did not return a turn id");
      const linked = createLinkedAbortSignal(signal, this.agent.timeoutMs);
      try {
        await Promise.race([
          completion,
          new Promise((_, reject) => linked.signal.addEventListener("abort", () => reject(linked.signal.reason || new Error("Codex timed out")), { once: true }))
        ]);
      } finally {
        linked.dispose();
      }
      return parseAgentEnvelope(completedItem || accumulated);
    } finally {
      signal?.removeEventListener("abort", abort);
      unsubscribe();
    }
  }

  close() {
    this.child?.kill("SIGTERM");
    this.child = null;
    this.ready = null;
  }
}

async function getCodexClient(agent) {
  const secret = await decryptSecret(agent.secretCipher);
  const signature = `${agent.updatedAt}:${agent.command}:${JSON.stringify(agent.args)}:${agent.cwd || ""}:${agent.model || ""}`;
  const existing = codexClients.get(agent.id);
  if (existing?.signature === signature) return existing.client;
  existing?.client.close();
  const client = new CodexAppServerClient(agent, secret);
  codexClients.set(agent.id, { signature, client });
  return client;
}

async function callConfiguredAgent(agent, messages, signal, context = {}) {
  if (agent.enabled === false) throw new Error("Активный агент отключён");
  if (agent.type === "openai-compatible") return callOpenAICompatible(agent, messages, signal, context);
  if (agent.type === "ollama") return callOllama(agent, messages, signal, context);
  if (agent.type === "http-agent") return callHttpAgent(agent, messages, signal, context);
  if (agent.type === "codex-app-server") {
    const client = await getCodexClient(agent);
    return client.run(messages, signal, context);
  }
  throw new Error("Unsupported active agent type");
}

async function activeAgent() {
  const registry = await loadRegistry();
  return registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
}

function profileForResponse(profile) {
  return {
    name: String(profile?.name || ""),
    email: String(profile?.email || ""),
    organization: String(profile?.organization || ""),
    region: String(profile?.region || ""),
    role: "super_admin",
    updatedAt: String(profile?.updatedAt || "")
  };
}


async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureProvisioningKeyPair() {
  await ensureConfigRoot();
  if (!(await fileExists(provisioningPrivateKeyFile)) || !(await fileExists(provisioningPublicKeyFile))) {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    await writeFile(provisioningPrivateKeyFile, privateKey, { mode: 0o600 });
    await writeFile(provisioningPublicKeyFile, publicKey, { mode: 0o644 });
  }
  return {
    privateKey: await readFile(provisioningPrivateKeyFile, "utf8"),
    publicKey: await readFile(provisioningPublicKeyFile, "utf8")
  };
}

async function qwenProvisioningState() {
  try {
    const payload = JSON.parse(await readFile(qwenProvisionedFile, "utf8"));
    return { provisioned: true, ...payload };
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("[prosmet] qwen provisioning marker", error);
    return { provisioned: false };
  }
}

async function testQwenKey(secret, {
  baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model = "qwen-plus"
} = {}) {
  const temporaryAgent = {
    id: "qwen-provisioning-test",
    name: "Qwen provisioning test",
    type: "openai-compatible",
    enabled: true,
    model,
    baseUrl,
    command: null,
    args: [],
    cwd: null,
    systemPrompt: null,
    timeoutMs: 120000,
    secretCipher: await encryptSecret(secret),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const startedAt = Date.now();
  const result = await callOpenAICompatible(
    temporaryAgent,
    [{ role: "user", content: "Ответь JSON: {\"text\":\"OK\",\"artifact\":null,\"estimate\":null}." }],
    new AbortController().signal,
    { intent: { kind: "general", allowEstimate: false, enablePriceResearch: false }, requestId: "qwen-provisioning" }
  );
  if (!/OK/i.test(result.text || "")) throw new Error("Qwen не подтвердил тестовое соединение");
  return { ok: true, latencyMs: Date.now() - startedAt, model, baseUrl };
}

async function completeQwenProvisioning(encryptedPayload) {
  const state = await qwenProvisioningState();
  if (state.provisioned) return { ...state, alreadyProvisioned: true };
  const { privateKey } = await ensureProvisioningKeyPair();
  let payload;
  try {
    const plaintext = privateDecrypt({
      key: privateKey,
      oaepHash: "sha256",
      padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING
    }, Buffer.from(String(encryptedPayload || ""), "base64url"));
    payload = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Не удалось расшифровать одноразовый пакет Qwen");
  }

  const secret = String(payload.key || "").trim();
  const nonce = String(payload.nonce || "").trim();
  const createdAt = Date.parse(String(payload.createdAt || ""));
  if (!secret || !nonce || !Number.isFinite(createdAt)) throw new Error("Пакет Qwen неполный");
  if (Math.abs(Date.now() - createdAt) > 15 * 60 * 1000) throw new Error("Срок действия пакета Qwen истёк");
  if (!expectedQwenKeySha256) {
    throw new Error("Provisioning Qwen отключён: задайте PROSMET_QWEN_KEY_SHA256 на сервере");
  }
  const digest = createHash("sha256").update(secret).digest("hex");
  if (!constantTimeEqual(digest, expectedQwenKeySha256)) throw new Error("Ключ Qwen не соответствует разрешённому отпечатку");
  if (!workflowStore.useProvisioningNonce(nonce)) throw new Error("Пакет Qwen уже использован");

  const baseUrl = normalizeUrl(payload.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1", "URL Qwen");
  const model = optionalString(payload.model, 160) || "qwen-plus";
  const test = await testQwenKey(secret, { baseUrl, model });
  const connected = await mutateRegistry(async (registry) => {
    const existingIndex = registry.agents.findIndex((agent) =>
      agent.type === "openai-compatible" && /qwen|dashscope|aliyuncs/i.test(`${agent.name} ${agent.model} ${agent.baseUrl}`)
    );
    const existing = existingIndex >= 0 ? registry.agents[existingIndex] : null;
    const agent = await normalizeAgentInput({
      name: "Qwen Plus · поиск цен",
      type: "openai-compatible",
      enabled: true,
      model,
      baseUrl,
      timeoutMs: 240000,
      secret,
      systemPrompt: "Для расчётов используй веб-поиск Qwen только для актуальных коммерческих цен и нормативных источников; возвращай источники и дату проверки в текстовом пояснении."
    }, existing);
    if (existingIndex >= 0) registry.agents[existingIndex] = agent;
    else registry.agents.push(agent);
    registry.activeAgentId = agent.id;
    return sanitizeAgent(agent, registry.activeAgentId);
  });
  const marker = {
    provisioned: true,
    agentId: connected.id,
    model: connected.model,
    baseUrl: connected.baseUrl,
    testedAt: nowIso(),
    latencyMs: test.latencyMs,
    releaseSha
  };
  await writeFile(qwenProvisionedFile, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  return marker;
}

function documentTypeLabel(type) {
  return ({
    "commercial-proposal": "Коммерческое предложение",
    invoice: "Счёт",
    contract: "Договор подряда",
    act: "Акт выполненных работ",
    "ks-2": "КС-2",
    "ks-3": "КС-3"
  })[type] || type;
}

function documentNumber(type, project, estimate) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = ({
    "commercial-proposal": "KP",
    invoice: "INV",
    contract: "DOG",
    act: "ACT",
    "ks-2": "KS2",
    "ks-3": "KS3"
  })[type] || "DOC";
  return `${prefix}-${date}-${estimate.revision}-${project.id.slice(-6).toUpperCase()}`;
}

function documentLinesForEstimate(estimate, project, type) {
  const actualTypes = new Set(["act", "ks-2", "ks-3"]);
  const progress = actualTypes.has(type) ? workflowStore.progress(project.id) : [];
  const progressByItem = new Map(progress.map((item) => [item.itemId, item]));
  return estimate.sections.map((section) => ({
    title: section.title,
    lines: section.items
      .map((item) => {
        const execution = progressByItem.get(item.id);
        const quantity = actualTypes.has(type)
          ? finiteNonNegative(execution?.actualQuantity)
          : finiteNonNegative(item.quantity);
        return {
          name: item.name,
          unit: item.unit,
          quantity,
          unitPrice: finiteNonNegative(item.unitPrice),
          total: quantity * finiteNonNegative(item.unitPrice)
        };
      })
      .filter((line) => !actualTypes.has(type) || line.quantity > 0)
  })).filter((section) => section.lines.length > 0);
}

function documentTotals(estimate, sections) {
  const direct = sections.reduce(
    (total, section) => total + section.lines.reduce((sum, line) => sum + line.total, 0),
    0
  );
  const overhead = direct * finiteNonNegative(estimate.overheadPercent) / 100;
  const profit = (direct + overhead) * finiteNonNegative(estimate.profitPercent) / 100;
  const vat = (direct + overhead + profit) * finiteNonNegative(estimate.vatPercent) / 100;
  return { direct, overhead, profit, vat, total: direct + overhead + profit + vat };
}

function buildDocumentContent(type, estimate, project, profile) {
  const sections = documentLinesForEstimate(estimate, project, type);
  const totals = documentTotals(estimate, sections);
  const organization = profile?.organization || "Исполнитель не указан";
  const customer = estimate.customer || project.customer || "Заказчик не указан";
  const commonNotes = [
    "Документ сформирован из зафиксированной версии сметы ProSmet; исходные значения и история изменений сохраняются отдельно.",
    "Перед юридически значимым использованием проверьте реквизиты сторон, сроки, налогообложение и актуальность применимых норм.",
    "Рыночные цены являются коммерческими ориентирами на дату расчёта и могут требовать подтверждения счетами поставщиков."
  ];
  const clausesByType = {
    "commercial-proposal": [
      `Исполнитель: ${organization}. Заказчик: ${customer}.`,
      "Предложение действительно 14 календарных дней, если стороны письменно не согласовали иной срок.",
      "Окончательная стоимость корректируется только через новую версию сметы с сохранением истории."
    ],
    invoice: [
      `Плательщик: ${customer}. Получатель: ${organization}.`,
      "Счёт является проектом до заполнения банковских и налоговых реквизитов исполнителя.",
      "Назначение платежа должно ссылаться на объект и согласованную версию сметы."
    ],
    contract: [
      "Предмет: выполнение строительных работ по утверждённой смете и технологической карте.",
      "Цена, состав и объёмы работ меняются только оформленной версией сметы или дополнительным соглашением.",
      "Сроки, порядок оплаты, порядок приёмки, гарантийные обязательства и ответственность сторон требуют заполнения до подписания.",
      "Проект договора должен пройти проверку юриста с учётом статуса сторон и конкретного объекта."
    ],
    act: [
      "В акт включены только позиции с фактическим объёмом больше нуля.",
      "Подписание акта подтверждает объём выполненных работ, но не отменяет замечания, прямо зафиксированные сторонами."
    ],
    "ks-2": [
      "Черновик подготовлен по структуре акта о приёмке выполненных работ КС-2 на основании фактических объёмов.",
      "Перед подписанием необходимо заполнить обязательные реквизиты, период, коды и проверить применимость формы к конкретному договору."
    ],
    "ks-3": [
      "Черновик справки КС-3 сформирован на основании принятых фактических объёмов и связанного КС-2.",
      "Перед подписанием необходимо проверить реквизиты, период, налогообложение и итоговые суммы."
    ]
  };
  return {
    heading: `${documentTypeLabel(type)} № ${documentNumber(type, project, estimate)}`,
    introduction: `${estimate.title}. Объект: ${project.title}. Регион: ${project.region || "не указан"}.`,
    sections,
    totals,
    clauses: clausesByType[type] || [],
    notes: commonNotes
  };
}

async function generateWorkflowDocument(type, estimate, project) {
  const registry = await loadRegistry();
  const profile = profileForResponse(registry.profile);
  const number = documentNumber(type, project, estimate);
  const content = buildDocumentContent(type, estimate, project, profile);
  return workflowStore.saveDocument({
    projectId: project.id,
    estimateId: estimate.id,
    type,
    status: "ready",
    number,
    title: `${documentTypeLabel(type)} · ${project.title}`,
    content
  });
}

function requireEstimate(estimateId) {
  const estimate = estimateStore.getEstimate(estimateId, "production");
  if (!estimate) {
    const error = new Error("Смета не найдена");
    error.code = "ESTIMATE_NOT_FOUND";
    throw error;
  }
  return estimate;
}

function requireDocument(projectId, type, statuses = null) {
  const document = workflowStore.documents(projectId).find((item) =>
    item.type === type && (!statuses || statuses.includes(item.status))
  );
  if (!document) throw new Error(`Сначала сформируйте ${documentTypeLabel(type)}`);
  return document;
}

async function runWorkflowAction(estimateId, action) {
  let estimate = requireEstimate(estimateId);
  let project = workflowStore.ensureProject(estimate);

  if (action === "save-version") {
    estimate = estimateStore.saveEstimate({
      ...estimate,
      revision: estimate.revision + 1,
      status: "review",
      updatedAt: nowIso()
    }, { ownerId: "production" });
    project = workflowStore.ensureProject(estimate, { status: "estimate_review" });
    workflowStore.recordRevision(estimate, "save-version");
    workflowStore.observePrices(estimate, "user_review", "Сохранённая версия", 0.78);
  } else if (action === "send-client") {
    if (!new Set(["review", "sent", "approved"]).has(estimate.status)) {
      throw new Error("Сначала сохраните проверенную версию сметы");
    }
    estimate = estimateStore.saveEstimate({ ...estimate, status: "sent", updatedAt: nowIso() }, { ownerId: "production" });
    project = workflowStore.ensureProject(estimate, { status: "estimate_sent" });
    workflowStore.recordRevision(estimate, "send-client");
  } else if (action === "approve") {
    if (!new Set(["review", "sent", "approved"]).has(estimate.status)) {
      throw new Error("Сначала сохраните версию и передайте её на согласование");
    }
    estimate = estimateStore.saveEstimate({ ...estimate, status: "approved", updatedAt: nowIso() }, { ownerId: "production" });
    project = workflowStore.ensureProject(estimate, { status: "estimate_approved" });
    workflowStore.recordRevision(estimate, "approve");
    workflowStore.observePrices(estimate, "approved_estimate", "Утверждённая смета", 0.95);
  } else if (action === "generate-proposal") {
    if (!new Set(["sent", "approved"]).has(estimate.status)) throw new Error("Сначала передайте или утвердите смету");
    await generateWorkflowDocument("commercial-proposal", estimate, project);
    project = workflowStore.setProjectStatus(project.id, "proposal_ready");
  } else if (action === "generate-invoice") {
    if (!new Set(["sent", "approved"]).has(estimate.status)) throw new Error("Сначала передайте или утвердите смету");
    await generateWorkflowDocument("invoice", estimate, project);
  } else if (action === "generate-contract") {
    if (estimate.status !== "approved") throw new Error("Договор формируется только из утверждённой сметы");
    await generateWorkflowDocument("contract", estimate, project);
    project = workflowStore.setProjectStatus(project.id, "contract_ready");
  } else if (action === "sign-contract") {
    const contract = requireDocument(project.id, "contract", ["ready", "sent", "signed"]);
    workflowStore.setDocumentStatus(contract.id, "signed");
    project = workflowStore.setProjectStatus(project.id, "contracted");
  } else if (action === "start-work") {
    requireDocument(project.id, "contract", ["signed"]);
    project = workflowStore.setProjectStatus(project.id, "in_progress");
  } else if (action === "complete-work") {
    if (!new Set(["in_progress", "completion_review"]).has(project.status)) throw new Error("Сначала запустите выполнение работ");
    if (!workflowStore.progress(project.id).some((item) => item.actualQuantity > 0 || item.status === "done")) {
      throw new Error("Зафиксируйте фактические объёмы выполненных работ");
    }
    project = workflowStore.setProjectStatus(project.id, "completion_review");
  } else if (action === "generate-act") {
    if (!new Set(["in_progress", "completion_review"]).has(project.status)) throw new Error("Сначала зафиксируйте выполнение работ");
    await generateWorkflowDocument("act", estimate, project);
    project = workflowStore.setProjectStatus(project.id, "completion_review");
  } else if (action === "generate-ks2") {
    requireDocument(project.id, "act", ["ready", "sent", "signed", "approved"]);
    await generateWorkflowDocument("ks-2", estimate, project);
  } else if (action === "generate-ks3") {
    requireDocument(project.id, "ks-2", ["ready", "sent", "signed", "approved"]);
    await generateWorkflowDocument("ks-3", estimate, project);
  } else if (action === "close-project") {
    requireDocument(project.id, "act");
    requireDocument(project.id, "ks-2");
    requireDocument(project.id, "ks-3");
    project = workflowStore.setProjectStatus(project.id, "completed");
  } else {
    throw new Error("Неизвестное действие процесса");
  }

  return workflowStore.workflow(estimateStore.getEstimate(estimate.id, "production"));
}

function greetingResponse() {
  return {
    text: "Здравствуйте. Опишите объект, регион, размеры или объёмы и желаемый состав работ. Я уточню недостающие данные и подготовлю смету только после явного запроса на расчёт.",
    artifact: null,
    intent: "greeting",
    workflow: null,
    agent: null
  };
}

function generalResponse() {
  return {
    text: "ProSmet специализируется на строительных сметах, проектах и документах. Опишите строительную задачу или попросите рассчитать стоимость работ и материалов.",
    artifact: null,
    intent: "general",
    workflow: null,
    agent: null
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      runtime: "node-static",
      ui: "greenfield",
      workflowSchema: "construction-lifecycle-v1"
    });
  }

  if (request.method === "GET" && url.pathname === "/api/system") {
    const [registry, qwen] = await Promise.all([loadRegistry(), qwenProvisioningState()]);
    const adminAuthenticated = await isAdmin(request);
    const active = registry.agents.find((agent) => agent.id === registry.activeAgentId) || null;
    return sendJson(response, 200, {
      ok: true,
      app: "prosmet-greenfield-v3",
      releaseSha,
      ui: "greenfield",
      activeAgent: active ? sanitizeAgent(active, registry.activeAgentId) : null,
      configuredAgents: registry.agents.length,
      adminAuthenticated,
      bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN,
      profileConfigured: Boolean(registry.profile?.name || registry.profile?.organization),
      persistence: "sqlite-artifact-store",
      workflowSchema: "construction-lifecycle-v1",
      qwen: {
        provisioned: Boolean(qwen.provisioned),
        model: qwen.model || null,
        testedAt: qwen.testedAt || null
      }
    });
  }

  if (url.pathname === "/api/admin/session") {
    if (request.method === "GET") {
      return sendJson(response, 200, {
        authenticated: await isAdmin(request),
        bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN
      });
    }
    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const expected = await getAdminToken();
      if (!constantTimeEqual(String(body.token || ""), expected)) {
        return sendError(response, 401, "INVALID_ADMIN_TOKEN", "Неверный токен супер-администратора.");
      }
      const session = await createAdminSession();
      return sendJson(response, 200, { authenticated: true, bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN }, {
        "set-cookie": `prosmet_admin_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
      });
    }
    if (request.method === "DELETE") {
      return sendJson(response, 200, { authenticated: false, bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN }, {
        "set-cookie": "prosmet_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
      });
    }
  }

  if (url.pathname === "/api/account") {
    if (!(await requireAdmin(request, response))) return;
    if (request.method === "GET") {
      const registry = await loadRegistry();
      return sendJson(response, 200, profileForResponse(registry.profile));
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const profile = await mutateRegistry((registry) => {
        registry.profile = {
          name: optionalString(body.name, 160) || "",
          email: optionalString(body.email, 320) || "",
          organization: optionalString(body.organization, 240) || "",
          region: optionalString(body.region, 240) || "",
          role: "super_admin",
          updatedAt: new Date().toISOString()
        };
        return registry.profile;
      });
      return sendJson(response, 200, profileForResponse(profile));
    }
  }

  if (request.method === "GET" && url.pathname === "/api/capabilities") {
    return sendJson(response, 200, capabilityManifest);
  }

  if (request.method === "GET" && url.pathname === "/api/estimates") {
    return sendJson(response, 200, {
      estimates: estimateStore.listEstimates("production"),
      persistence: "sqlite"
    });
  }

  const estimateRoute = url.pathname.match(/^\/api\/estimates\/([^/]+)$/);
  if (estimateRoute) {
    const estimateId = decodeURIComponent(estimateRoute[1]);
    if (request.method === "GET") {
      const estimate = estimateStore.getEstimate(estimateId, "production");
      if (!estimate) return sendError(response, 404, "ESTIMATE_NOT_FOUND", "Смета не найдена.");
      return sendJson(response, 200, estimate);
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      const incoming = validateEstimate(body.estimate ?? body);
      if (!incoming || incoming.id !== estimateId) {
        return sendError(response, 400, "INVALID_ESTIMATE", "Передана некорректная смета.");
      }
      const previous = estimateStore.getEstimate(estimateId, "production");
      const clientSent = previous?.status === "approved" && incoming.status === "sent";
      const estimate = clientSent ? { ...incoming, status: "approved" } : incoming;
      const stored = estimateStore.saveEstimate(estimate, { ownerId: "production" });
      let project = workflowStore.ensureProject(stored);
      if (previous && incoming.revision > previous.revision) {
        project = workflowStore.ensureProject(stored, { status: "estimate_review" });
        workflowStore.recordRevision(stored, "save-version");
        workflowStore.observePrices(stored, "user_review", "Сохранённая версия", 0.78);
      }
      if (previous && previous.status !== incoming.status && incoming.status === "sent") {
        project = workflowStore.ensureProject(stored, { status: clientSent ? "estimate_approved" : "estimate_sent" });
        workflowStore.recordRevision(stored, "send-client");
      }
      if (previous && previous.status !== incoming.status && incoming.status === "approved") {
        project = workflowStore.ensureProject(stored, { status: "estimate_approved" });
        workflowStore.recordRevision(stored, "approve");
        workflowStore.observePrices(stored, "approved_estimate", "Утверждённая смета", 0.95);
      }
      return sendJson(response, 200, { ...stored, workflowProjectId: project.id });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/provisioning/qwen/public-key") {
    const state = await qwenProvisioningState();
    if (state.provisioned) return sendJson(response, 200, { ...state, publicKey: null });
    const { publicKey } = await ensureProvisioningKeyPair();
    return sendJson(response, 200, {
      provisioned: false,
      algorithm: "RSA-OAEP-4096-SHA256",
      expiresInSeconds: 900,
      publicKey
    });
  }

  if (request.method === "POST" && url.pathname === "/api/provisioning/qwen/complete") {
    if (!(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const encryptedPayload = body.payload;
    if (!encryptedPayload) return sendError(response, 400, "QWEN_PAYLOAD_REQUIRED", "Не передан зашифрованный пакет Qwen");
    const completed = await completeQwenProvisioning(encryptedPayload);
    return sendJson(response, 200, completed);
  }

  if (request.method === "GET" && url.pathname === "/api/workflows/projects") {
    return sendJson(response, 200, { projects: workflowStore.projects("production") });
  }

  const projectProgressRoute = url.pathname.match(/^\/api\/workflows\/projects\/([^/]+)\/progress\/([^/]+)$/);
  if (projectProgressRoute && request.method === "PUT") {
    const projectId = decodeURIComponent(projectProgressRoute[1]);
    const itemId = decodeURIComponent(projectProgressRoute[2]);
    const project = workflowStore.project(projectId);
    if (!project) return sendError(response, 404, "PROJECT_NOT_FOUND", "Проект не найден");
    if (!new Set(["in_progress", "completion_review"]).has(project.status)) {
      return sendError(response, 409, "WORK_NOT_STARTED", "Фактические объёмы можно менять после запуска работ");
    }
    const patch = await readJsonBody(request);
    const progress = workflowStore.updateProgress(projectId, itemId, patch);
    const estimate = requireEstimate(project.activeEstimateId);
    return sendJson(response, 200, { progress, workflow: workflowStore.workflow(estimate) });
  }

  const projectWorkflowRoute = url.pathname.match(/^\/api\/workflows\/projects\/([^/]+)$/);
  if (projectWorkflowRoute && request.method === "GET") {
    const projectId = decodeURIComponent(projectWorkflowRoute[1]);
    const project = workflowStore.project(projectId);
    if (!project) return sendError(response, 404, "PROJECT_NOT_FOUND", "Проект не найден");
    return sendJson(response, 200, workflowStore.workflow(requireEstimate(project.activeEstimateId)));
  }

  const estimateActionRoute = url.pathname.match(/^\/api\/workflows\/estimates\/([^/]+)\/actions$/);
  if (estimateActionRoute && request.method === "POST") {
    const body = await readJsonBody(request);
    const workflow = await runWorkflowAction(decodeURIComponent(estimateActionRoute[1]), String(body.action || ""));
    return sendJson(response, 200, workflow);
  }

  const estimateWorkflowRoute = url.pathname.match(/^\/api\/workflows\/estimates\/([^/]+)$/);
  if (estimateWorkflowRoute && request.method === "GET") {
    const estimate = requireEstimate(decodeURIComponent(estimateWorkflowRoute[1]));
    return sendJson(response, 200, workflowStore.workflow(estimate));
  }

  if (request.method === "GET" && url.pathname === "/api/workflows/documents") {
    const projectId = url.searchParams.get("projectId");
    return sendJson(response, 200, { documents: workflowStore.documents(projectId || null) });
  }

  const documentActionRoute = url.pathname.match(/^\/api\/workflows\/documents\/([^/]+)\/actions$/);
  if (documentActionRoute && request.method === "POST") {
    const body = await readJsonBody(request);
    const status = String(body.action || "") === "send" ? "sent"
      : String(body.action || "") === "sign" ? "signed"
        : String(body.action || "") === "approve" ? "approved"
          : null;
    if (!status) return sendError(response, 400, "DOCUMENT_ACTION_INVALID", "Неизвестное действие документа");
    return sendJson(response, 200, workflowStore.setDocumentStatus(decodeURIComponent(documentActionRoute[1]), status));
  }

  const documentRoute = url.pathname.match(/^\/api\/workflows\/documents\/([^/]+)$/);
  if (documentRoute && request.method === "GET") {
    const document = workflowStore.document(decodeURIComponent(documentRoute[1]));
    if (!document) return sendError(response, 404, "DOCUMENT_NOT_FOUND", "Документ не найден");
    return sendJson(response, 200, document);
  }

  if (request.method === "GET" && url.pathname === "/api/workflows/prices") {
    return sendJson(response, 200, {
      entries: workflowStore.priceCatalog({
        query: url.searchParams.get("query") || "",
        region: url.searchParams.get("region") || "",
        limit: Number(url.searchParams.get("limit") || 200)
      })
    });
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
    const registry = await loadRegistry();
    return sendJson(response, 200, {
      agents: registry.agents.map((agent) => sanitizeAgent(agent, registry.activeAgentId)),
      activeAgentId: registry.activeAgentId,
      adminAuthenticated: await isAdmin(request),
      bootstrapRequired: !process.env.PROSMET_ADMIN_TOKEN
    });
  }

  if (request.method === "POST" && url.pathname === "/api/agents") {
    if (!(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const created = await mutateRegistry(async (registry) => {
      const agent = await normalizeAgentInput(body);
      registry.agents.push(agent);
      if (!registry.activeAgentId && agent.enabled !== false) registry.activeAgentId = agent.id;
      return sanitizeAgent(agent, registry.activeAgentId);
    });
    return sendJson(response, 201, created);
  }

  const agentRoute = url.pathname.match(/^\/api\/agents\/([^/]+)(?:\/(activate|test))?$/);
  if (agentRoute) {
    const agentId = decodeURIComponent(agentRoute[1]);
    const action = agentRoute[2] || null;
    if (!(await requireAdmin(request, response))) return;

    if (request.method === "PUT" && !action) {
      const body = await readJsonBody(request);
      const updated = await mutateRegistry(async (registry) => {
        const index = registry.agents.findIndex((agent) => agent.id === agentId);
        if (index < 0) return null;
        const agent = await normalizeAgentInput(body, registry.agents[index]);
        registry.agents[index] = agent;
        codexClients.get(agentId)?.client.close();
        codexClients.delete(agentId);
        return sanitizeAgent(agent, registry.activeAgentId);
      });
      if (!updated) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, updated);
    }

    if (request.method === "DELETE" && !action) {
      const removed = await mutateRegistry((registry) => {
        const index = registry.agents.findIndex((agent) => agent.id === agentId);
        if (index < 0) return false;
        registry.agents.splice(index, 1);
        if (registry.activeAgentId === agentId) {
          registry.activeAgentId = registry.agents.find((agent) => agent.enabled !== false)?.id || null;
        }
        codexClients.get(agentId)?.client.close();
        codexClients.delete(agentId);
        return true;
      });
      if (!removed) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, { deleted: true });
    }

    if (request.method === "POST" && action === "activate") {
      const activated = await mutateRegistry((registry) => {
        const agent = registry.agents.find((entry) => entry.id === agentId);
        if (!agent) return null;
        if (agent.enabled === false) throw new Error("Нельзя активировать отключённого агента");
        registry.activeAgentId = agent.id;
        return sanitizeAgent(agent, registry.activeAgentId);
      });
      if (!activated) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      return sendJson(response, 200, activated);
    }

    if (request.method === "POST" && action === "test") {
      const registry = await loadRegistry();
      const agent = registry.agents.find((entry) => entry.id === agentId);
      if (!agent) return sendError(response, 404, "AGENT_NOT_FOUND", "Агент не найден.");
      const startedAt = Date.now();
      const controller = new AbortController();
      const result = await callConfiguredAgent(agent, [
        { role: "user", content: "Проверь соединение. Верни JSON: text со словом OK, artifact null, estimate null." }
      ], controller.signal);
      return sendJson(response, 200, {
        ok: true,
        agentId: agent.id,
        latencyMs: Date.now() - startedAt,
        provider: agent.type,
        model: agent.model || null,
        message: result.text
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/agent") {
    if (!publicAgentAccess && !(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const intent = classifyRequest(body.messages);
    if (intent.kind === "greeting") return sendJson(response, 200, greetingResponse());
    if (intent.kind === "general") return sendJson(response, 200, generalResponse());

    const agent = await activeAgent();
    if (!agent) {
      return sendError(response, 409, "AGENT_NOT_CONFIGURED", "Подключите и активируйте агента в настройках.");
    }
    const controller = new AbortController();
    request.once("close", () => {
      if (!request.complete) controller.abort(new Error("Client disconnected"));
    });
    const requestId = optionalString(body.requestId, 160) || randomUUID();
    const registry = await loadRegistry();
    const region = optionalString(body.region, 240) || optionalString(registry.profile?.region, 240) || "";
    const priceContext = intent.enablePriceResearch
      ? workflowStore.priceContext(intent.text, region)
      : "";
    const context = { intent, requestId, priceContext };
    let result = await callConfiguredAgent(agent, body.messages, controller.signal, context);

    if (!intent.allowEstimate && result.artifact === "estimate") {
      result = {
        text: result.text || "Для создания сметы сформулируйте явный запрос на расчёт стоимости.",
        artifact: null,
        estimate: null
      };
    }

    if (intent.allowEstimate && result.artifact === "estimate" && result.estimate) {
      let issues = estimateQualityIssues(result.estimate, intent);
      if (issues.length) {
        result = await callConfiguredAgent(agent, [
          ...normalizeMessages(body.messages),
          {
            role: "system",
            content: `Предыдущая смета не прошла серверный контроль: ${issues.join(", ")}. Исправь её полностью. Не возвращай пустые разделы, нулевые цены или демонстрационный id.`
          },
          {
            role: "user",
            content: "Пересобери расчёт по исходному запросу и верни один валидный JSON-объект по схеме."
          }
        ], controller.signal, context);
        issues = result.artifact === "estimate" && result.estimate
          ? estimateQualityIssues(result.estimate, intent)
          : [];
      }
      if (issues.length) {
        result = {
          text: `Смета пока не создана: результат не прошёл контроль качества (${issues.join(", ")}). Уточните регион, размеры и состав работ.`,
          artifact: null,
          estimate: null
        };
      }
    }

    let artifact = null;
    let workflow = null;
    if (intent.allowEstimate && result.artifact === "estimate" && result.estimate) {
      const existingIds = new Set(estimateStore.listEstimates("production").map((estimate) => estimate.id));
      const returnedId = String(result.estimate.id || "");
      if (!returnedId || existingIds.has(returnedId) || /^(?:draft|demo|test|estimate-e2e)/i.test(returnedId)) {
        const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
        result.estimate = {
          ...result.estimate,
          id: `estimate-${safeRequestId}-${randomBytes(4).toString("hex")}`,
          revision: 1,
          status: "draft"
        };
      }
      const stored = estimateStore.saveEstimate(result.estimate, {
        ownerId: "production",
        sourceAgentId: agent.id,
        sourceRequestId: requestId
      });
      const project = workflowStore.ensureProject(stored, { status: "estimate_draft" });
      workflowStore.recordRevision(stored, "generated");
      workflowStore.observePrices(stored, "ai_research", agent.name, /qwen/i.test(`${agent.name} ${agent.model}`) ? 0.82 : 0.68);
      artifact = {
        type: "estimate",
        id: stored.id,
        revision: stored.revision,
        database: "sqlite"
      };
      workflow = { projectId: project.id, status: project.status };
    }
    return sendJson(response, 200, {
      text: artifact ? (result.text || "Смета сформирована, сохранена в базе и открыта в интерактивном редакторе.") : result.text,
      artifact,
      intent: intent.kind,
      workflow,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        model: agent.model || null
      }
    });
  }

  return false;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);
      if (handled !== false || response.writableEnded) return;
      return sendError(response, 404, "API_ROUTE_NOT_FOUND", "API route not found");
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      return response.end();
    }

    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let filePath = join(root, relative || "index.html");
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      return response.end();
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }

    try {
      const content = await readFile(filePath);
      const extension = extname(filePath);
      response.writeHead(200, {
        "content-type": mime[extension] || "application/octet-stream",
        "cache-control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY"
      });
      if (request.method === "HEAD") return response.end();
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  } catch (error) {
    const code = error?.code === "BODY_TOO_LARGE"
      ? "BODY_TOO_LARGE"
      : error?.code === "INVALID_JSON"
        ? "INVALID_JSON"
        : error?.code === "ESTIMATE_NOT_FOUND"
          ? "ESTIMATE_NOT_FOUND"
          : "REQUEST_FAILED";
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = code === "BODY_TOO_LARGE"
      ? 413
      : code === "INVALID_JSON"
        ? 400
        : code === "ESTIMATE_NOT_FOUND" || /не найден/iu.test(message)
          ? 404
          : /сначала|нельзя|только после|можно менять после|требуется/iu.test(message)
            ? 409
            : /некоррект|неизвестн|не передан|неполный|ист[её]к/iu.test(message)
              ? 400
              : 500;
    console.error("[prosmet]", error);
    if (!response.headersSent && !response.writableEnded) {
      sendError(response, status, code, message, error?.details);
    } else if (!response.writableEnded) {
      response.end();
    }
  }
});

server.listen(port, "127.0.0.1", async () => {
  await ensureConfigRoot();
  await getAdminToken();
  console.log(`Prosmet Greenfield listening on http://127.0.0.1:${port}`);
  console.log(`Agent configuration: ${registryFile}`);
  if (!process.env.PROSMET_ADMIN_TOKEN) {
    console.log(`Generated admin token path: ${adminTokenFile}`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const { client } of codexClients.values()) client.close();
    estimateStore.close();
    workflowStore.close();
    server.close(() => process.exit(0));
  });
}
