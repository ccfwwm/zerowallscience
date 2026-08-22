"""Extract a PDF with PyMuPDF for the shared ZeroWall Python runtime."""

from __future__ import annotations

import json
import pathlib
import sys

import pymupdf


MAX_TEXT_CHARACTERS = 1_000_000
MAX_RENDERED_PAGES = 12


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 3:
        print(json.dumps({"errorCode": "invalid_arguments"}))
        return 2
    source = pathlib.Path(sys.argv[1])
    output_dir = pathlib.Path(sys.argv[2])
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        document = pymupdf.open(source)
    except RuntimeError as error:
        message = str(error).lower()
        code = "encrypted" if "password" in message or "encrypted" in message else "damaged"
        print(json.dumps({"errorCode": code, "message": str(error)[-300:]}))
        return 3

    pages: list[dict[str, object]] = []
    text_parts: list[str] = []
    total = 0
    for index, page in enumerate(document):
        text = page.get_text("text").strip()
        if text and total < MAX_TEXT_CHARACTERS:
            text = text[: MAX_TEXT_CHARACTERS - total]
            text_parts.append(text)
            total += len(text)
        pages.append({"page": index + 1, "textCharacters": len(text)})

    rendered: list[str] = []
    scanned = total < max(80, len(document) * 24)
    if scanned:
        render_dir = output_dir / "pages"
        render_dir.mkdir(parents=True, exist_ok=True)
        for index in range(min(len(document), MAX_RENDERED_PAGES)):
            target = render_dir / f"page-{index + 1:03}.png"
            document[index].get_pixmap(
                matrix=pymupdf.Matrix(1.5, 1.5), alpha=False
            ).save(target)
            rendered.append(target.as_posix())

    payload = {
        "status": "needs_vision" if scanned else "ready",
        "parser": "pymupdf",
        "pageCount": len(document),
        "textCharacters": total,
        "text": "\n\n".join(text_parts),
        "pages": pages,
        "renderedPages": rendered,
        "warning": (
            "PDF contains little extractable text; rendered pages are ready for visual analysis."
            if scanned
            else None
        ),
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
