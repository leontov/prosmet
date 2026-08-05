from pathlib import Path

path = Path("scripts/apply-workspace-canvas-documents-v1.py")
source = path.read_text(encoding="utf-8")
old = '        raise SystemExit(f"{path}: expected exactly one target, found {count}")'
new = '        preview = old.splitlines()[0] if old.splitlines() else old[:120]\n        raise SystemExit(f"{path}: expected exactly one target, found {count}; target={preview!r}")'
if old not in source:
    raise SystemExit("replace_once diagnostic marker not found")
source = source.replace(old, new, 1)
share_marker = "    '''  const share = async () => {"
if source.count(share_marker) != 2:
    raise SystemExit(f"expected two share patch markers, found {source.count(share_marker)}")
source = source.replace(share_marker, "    r'''  const share = async () => {", 2)
callback_line = 'replace_once(professional, "      onOpenDocument={setDocumentOpen}", "      onOpenDocument={openDocument}")'
callback_block = '''source = professional.read_text(encoding="utf-8")
callback_target = "      onOpenDocument={setDocumentOpen}"
if source.count(callback_target) != 2:
    raise SystemExit(f"ProfessionalApp expected two document callbacks, found {source.count(callback_target)}")
professional.write_text(source.replace(callback_target, "      onOpenDocument={openDocument}", 2), encoding="utf-8")'''
if callback_line not in source:
    raise SystemExit("ProfessionalApp document callback patch marker not found")
source = source.replace(callback_line, callback_block, 1)
path.write_text(source, encoding="utf-8")
