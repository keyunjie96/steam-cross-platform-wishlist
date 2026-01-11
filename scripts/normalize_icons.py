#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "assets" / "icons"
ICONS_JS = REPO_ROOT / "icons.js"

KEY_MAP = {
    "ns": "nintendo",
    "ps": "playstation",
    "xbox": "xbox",
}

START_MARKER = "  // BEGIN GENERATED ICONS (scripts/normalize_icons.py)"
END_MARKER = "  // END GENERATED ICONS"


def _strip_ns(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def normalize_svg(svg_text: str) -> str:
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as exc:
        raise ValueError(f"Failed to parse SVG: {exc}") from exc

    parent_map = {child: parent for parent in root.iter() for child in parent}
    for elem in list(root.iter()):
        if _strip_ns(elem.tag) in {"title", "desc", "metadata"}:
            parent = parent_map.get(elem)
            if parent is not None:
                parent.remove(elem)

    view_box = root.attrib.get("viewBox")
    root.attrib.clear()
    root.set("width", "16")
    root.set("height", "16")
    root.set("viewBox", view_box or "0 0 16 16")
    root.set("fill", "currentColor")
    root.set("aria-hidden", "true")
    root.set("focusable", "false")

    for elem in root.iter():
        for attr in ("fill", "stroke"):
            if attr in elem.attrib:
                value = elem.attrib[attr].strip().lower()
                if value in {"none", "currentcolor"}:
                    continue
                elem.attrib.pop(attr, None)
        elem.attrib.pop("style", None)

    svg = ET.tostring(root, encoding="unicode")
    svg = re.sub(r">\s*<", ">\n<", svg).strip()
    return svg


def build_entries() -> str:
    entries = []
    for stem, key in KEY_MAP.items():
        path = SRC_DIR / f"{stem}.svg"
        if not path.exists():
            raise FileNotFoundError(f"Missing icon: {path}")
        svg = normalize_svg(path.read_text(encoding="utf-8"))
        lines = svg.splitlines() or [svg]
        if len(lines) == 1:
            entries.append(f"  {key}: `{lines[0]}`,")
            continue

        entry_lines = [f"  {key}: `{lines[0]}"]
        for line in lines[1:]:
            indent = "  " if line.startswith("</svg") else "    "
            entry_lines.append(f"{indent}{line}")
        entry_lines[-1] = f"{entry_lines[-1]}`,"
        entries.append("\n".join(entry_lines))

    return "\n\n".join(entries)


def update_icons_js(entries: str) -> bool:
    content = ICONS_JS.read_text(encoding="utf-8")
    pattern = re.compile(
        re.escape(START_MARKER) + r".*?" + re.escape(END_MARKER),
        re.DOTALL,
    )
    if not pattern.search(content):
        raise RuntimeError("icons.js markers not found")

    replacement = f"{START_MARKER}\n{entries}\n{END_MARKER}"
    updated = pattern.sub(replacement, content)
    if updated != content:
        ICONS_JS.write_text(updated, encoding="utf-8")
        return True
    return False


def main() -> int:
    entries = build_entries()
    changed = update_icons_js(entries)
    if changed:
        print("Updated icons.js from assets/icons")
    else:
        print("icons.js already up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
