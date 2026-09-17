"""R-2026-06-20 (CDE-D1):
Generate ``manusift/detectors/CATALOGUE.md`` from the live
detector registry.

Usage:
    .venv/Scripts/python.exe manusift/detectors/_build_catalogue.py

Output:
    manusift/detectors/CATALOGUE.md
"""
from pathlib import Path

from manusift.detectors import iter_registered_detectors


def _first_line(doc: str | None) -> str:
    if not doc:
        return "(no docstring)"
    s = doc.strip()
    if not s:
        return "(empty docstring)"
    return s.split("\n", 1)[0].strip()


def main() -> int:
    lines: list[str] = []
    lines.append("# Detector Catalogue")
    lines.append("")
    lines.append(
        "R-2026-06-20 (CDE-D1): generated from the live "
        "`manusift.detectors` entry-point registry."
    )
    lines.append("")
    lines.append(
        "Each detector exposes a `Finding` with a "
        "deterministic `detector_id` (the entry-point name). "
        "Findings roll up to a per-detector report section."
    )
    lines.append("")
    lines.append("## Index")
    lines.append("")
    detectors = list(iter_registered_detectors())
    for d in sorted(detectors, key=lambda x: x.name):
        lines.append(f"- [`{d.name}`](#{d.name.replace('_', '-')})")
    lines.append("")
    lines.append("## Detectors")
    lines.append("")
    for d in sorted(detectors, key=lambda x: x.name):
        lines.append(f"### `{d.name}`")
        lines.append("")
        lines.append(f"> {_first_line(d.__doc__)}")
        lines.append("")
        # Pull the category / severity if available
        cat = getattr(d, "category", None)
        if cat:
            lines.append(f"- **category**: `{cat}`")
        sev = getattr(d, "default_severity", None)
        if sev:
            lines.append(f"- **default_severity**: `{sev}`")
        lines.append("")
    out_path = Path(__file__).parent / "CATALOGUE.md"
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out_path} ({len(detectors)} detectors)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())