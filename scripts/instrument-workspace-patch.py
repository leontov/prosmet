from pathlib import Path

path = Path("scripts/apply-workspace-canvas-documents-v1.py")
source = path.read_text(encoding="utf-8")
old = '        raise SystemExit(f"{path}: expected exactly one target, found {count}")'
new = '        preview = old.splitlines()[0] if old.splitlines() else old[:120]\n        raise SystemExit(f"{path}: expected exactly one target, found {count}; target={preview!r}")'
if old not in source:
    raise SystemExit("replace_once diagnostic marker not found")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
