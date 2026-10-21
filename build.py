#!/usr/bin/env python3
"""Ricostruisce duello_dnd.html (file unico) da src/template.html + src/engine.js."""
from pathlib import Path

root = Path(__file__).parent
template = (root / "src" / "template.html").read_text(encoding="utf-8")
engine = (root / "src" / "engine.js").read_text(encoding="utf-8")
assert "</script>" not in engine
(root / "duello_dnd.html").write_text(template.replace("/*ENGINE*/", engine), encoding="utf-8")
print("Scritto duello_dnd.html")
