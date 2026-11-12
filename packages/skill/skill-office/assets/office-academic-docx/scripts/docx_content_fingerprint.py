"""Create a stable content fingerprint for a DOCX before and after formatting.

The fingerprint intentionally ignores styles, section geometry, page breaks and
document properties. It covers paragraph text, table cell text, inline shape
relationship ids and equation XML so a formatting pass can be rejected when it
silently changes protected content.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

from docx import Document


def fingerprint(path: Path) -> dict[str, object]:
    document = Document(path)
    paragraphs = [paragraph.text for paragraph in document.paragraphs]
    tables = [[cell.text for row in table.rows for cell in row.cells] for table in document.tables]
    equations: list[str] = []
    for paragraph in document.paragraphs:
        equations.extend(
            element.xml
            for element in paragraph._p.iter()
            if element.tag.endswith("}oMath") or element.tag.endswith("}oMathPara")
        )
    headers = [paragraph.text for section in document.sections for paragraph in (*section.header.paragraphs, *section.footer.paragraphs)]
    # Relationship ids and drawing XML change during a formatting pass. Hash the
    # actual embedded bytes instead, while retaining their count for the audit.
    with zipfile.ZipFile(path) as archive:
        media = sorted(
            hashlib.sha256(archive.read(name)).hexdigest()
            for name in archive.namelist()
            if name.startswith("word/media/") and not name.endswith("/")
        )
    payload = {"paragraphs": paragraphs, "tables": tables, "headers": headers, "equations": equations, "media": media}
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "paragraph_count": len(paragraphs),
        "table_count": len(tables),
        "equation_count": len(equations),
        "media_count": len(media),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docx", type=Path)
    parser.add_argument("--compare", type=Path)
    args = parser.parse_args()
    before = fingerprint(args.docx)
    output: dict[str, object] = {"before": before}
    if args.compare:
        after = fingerprint(args.compare)
        output["after"] = after
        output["content_unchanged"] = before["sha256"] == after["sha256"]
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
