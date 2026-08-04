from pathlib import Path

server_path = Path("apps/web/server.mjs")
source = server_path.read_text(encoding="utf-8")
lines = source.splitlines()

intent_count = 0
fingerprint_count = 0
codex_count = 0
for index, line in enumerate(lines):
    if line.startswith("const estimateIntentPattern = "):
        lines[index] = "const estimateIntentPattern = /(?:смет|рассч(?:итай|итать|ёт)|калькуляц|бюджет|стоимост|расход|сколько\\s+(?:стоит|будет)|цена\\s+под\\s+ключ)/iu;"
        intent_count += 1
    if line.startswith("const expectedQwenKeySha256 = "):
        lines[index] = "const expectedQwenKeySha256 = process.env.PROSMET_QWEN_KEY_SHA256?.trim() || \"\";"
        fingerprint_count += 1
    if line.strip() == "const prompt = `${this.agent.systemPrompt || systemInstructions}\\n\\n${conversationPrompt(messages)}`;":
        lines[index] = "      const prompt = `${composeSystemPrompt(this.agent, context)}\\n\\n${conversationPrompt(messages)}`;"
        codex_count += 1

if (intent_count, fingerprint_count, codex_count) != (1, 1, 1):
    raise SystemExit(
        f"Unexpected replacement counts: intent={intent_count}, fingerprint={fingerprint_count}, codex={codex_count}"
    )

source = "\n".join(lines) + "\n"

old_digest = '''  const digest = createHash("sha256").update(secret).digest("hex");
  if (!constantTimeEqual(digest, expectedQwenKeySha256)) throw new Error("Ключ Qwen не соответствует разрешённому отпечатку");'''
new_digest = '''  if (!expectedQwenKeySha256) {
    throw new Error("Provisioning Qwen отключён: задайте PROSMET_QWEN_KEY_SHA256 на сервере");
  }
  const digest = createHash("sha256").update(secret).digest("hex");
  if (!constantTimeEqual(digest, expectedQwenKeySha256)) throw new Error("Ключ Qwen не соответствует разрешённому отпечатку");'''
if source.count(old_digest) != 1:
    raise SystemExit(f"Expected one Qwen digest block, found {source.count(old_digest)}")
source = source.replace(old_digest, new_digest)

old_route = '''  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/provisioning/qwen/complete") {
    const body = request.method === "POST" ? await readJsonBody(request) : {};
    const encryptedPayload = body.payload || url.searchParams.get("payload");
    if (!encryptedPayload) return sendError(response, 400, "QWEN_PAYLOAD_REQUIRED", "Не передан зашифрованный пакет Qwen");
    const completed = await completeQwenProvisioning(encryptedPayload);
    return sendJson(response, 200, completed);
  }'''
new_route = '''  if (request.method === "POST" && url.pathname === "/api/provisioning/qwen/complete") {
    if (!(await requireAdmin(request, response))) return;
    const body = await readJsonBody(request);
    const encryptedPayload = body.payload;
    if (!encryptedPayload) return sendError(response, 400, "QWEN_PAYLOAD_REQUIRED", "Не передан зашифрованный пакет Qwen");
    const completed = await completeQwenProvisioning(encryptedPayload);
    return sendJson(response, 200, completed);
  }'''
if source.count(old_route) != 1:
    raise SystemExit(f"Expected one Qwen completion route, found {source.count(old_route)}")
server_path.write_text(source.replace(old_route, new_route), encoding="utf-8")

contract_path = Path("scripts/greenfield-contract.mjs")
contract = contract_path.read_text(encoding="utf-8")
marker = "if (failures.length) {"
guard = '''
if (server.includes('const expectedQwenKeySha256 = "')) failures.push("server:qwen-hardcoded-key-fingerprint");
if (!server.includes("process.env.PROSMET_QWEN_KEY_SHA256")) failures.push("server:qwen-key-fingerprint-env-missing");
if (!server.includes('request.method === "POST" && url.pathname === "/api/provisioning/qwen/complete"')) failures.push("server:qwen-provisioning-post-only-missing");
if (!server.includes("composeSystemPrompt(this.agent, context)") || !server.includes("conversationPrompt(messages)")) failures.push("server:codex-context-prompt-missing");
if (/estimateIntentPattern[^\\n]+коммерческ/u.test(server)) failures.push("server:document-intent-can-create-estimate");

'''
if "server:qwen-hardcoded-key-fingerprint" not in contract:
    if contract.count(marker) != 1:
        raise SystemExit("Could not locate contract insertion marker")
    contract_path.write_text(contract.replace(marker, guard + marker), encoding="utf-8")
