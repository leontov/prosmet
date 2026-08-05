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
path.write_text(source, encoding="utf-8")
