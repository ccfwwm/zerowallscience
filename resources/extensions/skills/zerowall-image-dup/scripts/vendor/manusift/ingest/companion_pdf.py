"""Merge figures from companion SI PDFs into the main ParsedDoc (P6.3).

When ``inputs/materials/`` contains supplementary PDFs
(``*Supplementary*``, ``*MOESM*``, ``SI*.pdf``, …), extract their
images into ``steps/images/`` with a page offset so detectors see
main + SI figures in one pass (within-paper SI vs main reuse).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from ..contracts import ExtractedImage, ParsedDoc
from ..trace import get_logger
from ..workspace import JobPaths

log = get_logger(__name__)

_SI_PDF_RE = re.compile(
    r"(supplement|si[_-]|moesm|supporting.?info|appendix)",
    re.IGNORECASE,
)
# Virtual page offset so SI pages do not collide with main text pages.
_SI_PAGE_BASE = 10_000


def list_companion_pdfs(materials_dir: Path) -> list[Path]:
    if not materials_dir.is_dir():
        return []
    out: list[Path] = []
    for p in sorted(materials_dir.iterdir()):
        if not p.is_file():
            continue
        if p.suffix.lower() != ".pdf":
            continue
        if _SI_PDF_RE.search(p.name):
            out.append(p)
    return out


def extract_images_from_pdf(
    pdf_path: Path,
    *,
    images_dir: Path,
    page_base: int,
    source_tag: str,
) -> list[ExtractedImage]:
    """Best-effort image extract; empty list on failure."""
    try:
        import fitz  # PyMuPDF
    except Exception:  # noqa: BLE001
        return []
    from .pdf import _compute_phash, _extract_exif

    images: list[ExtractedImage] = []
    images_dir.mkdir(parents=True, exist_ok=True)
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:  # noqa: BLE001
        log.info(
            "companion pdf open failed",
            extra={"path": str(pdf_path), "err": str(exc)},
        )
        return []
    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            for img_index, img_info in enumerate(page.get_images(full=True)):
                xref = img_info[0]
                try:
                    base = doc.extract_image(xref)
                except Exception:  # noqa: BLE001
                    continue
                img_bytes = base["image"]
                width = int(base.get("width", 0) or 0)
                height = int(base.get("height", 0) or 0)
                if width < 64 or height < 64:
                    continue
                if len(img_bytes) < 5 * 1024:
                    continue
                phash = _compute_phash(img_bytes)
                exif = _extract_exif(img_bytes) or {}
                exif = dict(exif)
                exif["source_pdf"] = source_tag
                exif["source_page"] = page_index
                ext = base.get("ext", "png")
                safe = re.sub(r"[^\w.\-]+", "_", source_tag)[:40]
                out = (
                    images_dir
                    / f"si_{safe}_p{page_index:03d}_{img_index:03d}.{ext}"
                )
                try:
                    out.write_bytes(img_bytes)
                    image_path = str(out)
                except OSError:
                    image_path = None
                images.append(
                    ExtractedImage(
                        page=page_base + page_index,
                        index=img_index,
                        xref=xref,
                        phash=phash,
                        width=width,
                        height=height,
                        bytes_size=len(img_bytes),
                        exif=exif,
                        image_path=image_path,
                    )
                )
    finally:
        doc.close()
    return images


def merge_companion_pdf_images(
    doc: ParsedDoc,
    paths: JobPaths,
) -> ParsedDoc:
    """Return a new ParsedDoc with SI figures appended (if any)."""
    materials = paths.materials_dir
    pdfs = list_companion_pdfs(materials)
    if not pdfs:
        return doc
    extra: list[ExtractedImage] = []
    for i, pdf in enumerate(pdfs):
        page_base = _SI_PAGE_BASE + i * 1000
        extra.extend(
            extract_images_from_pdf(
                pdf,
                images_dir=paths.images_dir,
                page_base=page_base,
                source_tag=pdf.name,
            )
        )
    if not extra:
        return doc
    log.info(
        "merged companion SI images",
        extra={"n_pdfs": len(pdfs), "n_images": len(extra)},
    )
    # ParsedDoc may be a dataclass — rebuild with extended images
    return ParsedDoc(
        trace_id=doc.trace_id,
        source_path=doc.source_path,
        text_blocks=doc.text_blocks,
        images=list(doc.images or []) + extra,
        metadata=dict(doc.metadata or {}),
        tables=list(doc.tables or []),
    )
