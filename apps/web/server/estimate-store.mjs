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

export function createEstimateStore(databasePath) {
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
