from pathlib import Path

server_path = Path("apps/web/server.mjs")
server = server_path.read_text(encoding="utf-8")

old_index = '''    CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_project_identity
      ON workflow_projects(owner_id, title, region);
    CREATE INDEX IF NOT EXISTS idx_workflow_projects_updated'''
new_index = '''    DROP INDEX IF EXISTS idx_workflow_project_identity;
    CREATE INDEX IF NOT EXISTS idx_workflow_project_lookup
      ON workflow_projects(owner_id, title, region);
    CREATE INDEX IF NOT EXISTS idx_workflow_projects_updated'''
if server.count(old_index) != 1:
    raise SystemExit(f"Expected one legacy project identity index, found {server.count(old_index)}")
server = server.replace(old_index, new_index)

old_statement = '  const selectProjectByIdentity = db.prepare("SELECT * FROM workflow_projects WHERE owner_id = ? AND title = ? AND region = ? LIMIT 1");\n'
if server.count(old_statement) != 1:
    raise SystemExit(f"Expected one title/region project lookup statement, found {server.count(old_statement)}")
server = server.replace(old_statement, "")

old_identity = '''    const existing = selectProjectByEstimate.get(estimate.id)
      || selectProjectByIdentity.get(ownerId, title, region);
    const id = existing?.id || stableEntityId("project", ownerId, title, region || estimate.id);'''
new_identity = '''    const existing = selectProjectByEstimate.get(estimate.id);
    const id = existing?.id || stableEntityId("project", ownerId, estimate.id, title, region);'''
if server.count(old_identity) != 1:
    raise SystemExit(f"Expected one legacy project identity block, found {server.count(old_identity)}")
server_path.write_text(server.replace(old_identity, new_identity), encoding="utf-8")

contract_path = Path("scripts/greenfield-contract.mjs")
contract = contract_path.read_text(encoding="utf-8")
marker = "if (failures.length) {"
guards = '''
if (server.includes("selectProjectByIdentity.get(ownerId, title, region)")) failures.push("server:project-title-region-reuse");
if (server.includes("CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_project_identity")) failures.push("server:project-title-region-unique-index");
if (!server.includes('stableEntityId("project", ownerId, estimate.id, title, region)')) failures.push("server:project-estimate-bound-identity-missing");
if (!server.includes("DROP INDEX IF EXISTS idx_workflow_project_identity")) failures.push("server:project-identity-migration-missing");

'''
if "server:project-title-region-reuse" not in contract:
    if contract.count(marker) != 1:
        raise SystemExit("Could not locate greenfield contract insertion point")
    contract = contract.replace(marker, guards + marker)
    contract_path.write_text(contract, encoding="utf-8")
