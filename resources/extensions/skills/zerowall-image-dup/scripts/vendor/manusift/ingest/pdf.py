"""PDF ingestion: text blocks, embedded images, document metadata."""
from __future__ import annotations

import io
from pathlib import Path

import fitz  # PyMuPDF
import imagehash
from PIL import Image, UnidentifiedImageError

from ..contracts import ExtractedImage, ParsedDoc, TextBlock
from ..trace import get_logger

log = get_logger(__name__)


def _images_dir(trace_id: str, workspace_dir: Path) -> Path:
    """Where the ingest layer writes extracted rasters for later detectors.

    Images live inside the per-job dir (``steps/images/``) so the
    per-job layout in ``workspace.py`` stays the source of truth.
    """
    d = workspace_dir / trace_id / "steps" / "images"
    d.mkdir(parents=True, exist_ok=True)
    return d


# Smallest image we will
# bother pHash-ing. The
# threshold is calibrated
# against real-world PDFs:
# Nature / Science figures
# routinely include small
# (~18-23 px) chart
# markers (circle / square
# / triangle icons
# repeated for legend
# styling). These are
# meaningful for the
# duplicate detector --
# "is the same legend
# marker being reused?"
# -- so we accept anything
# >= 16 px on both axes.
# Below 16 px the resize
# to 32x32 destroys all
# signal and the hash
# becomes noise.
#
# (The original 32-px
# threshold was too
# aggressive and dropped
# ~25% of the legitimate
# duplicate findings in
# the Nature pilot.)
_MIN_PHASH_SIDE = 16


def _compute_phash(
    image_bytes: bytes,
) -> str | None:
    """A 64-bit perceptual hash,
    returned as 16 hex chars.

    Implemented with
    ``imagehash.phash`` --
    DCT-based, the standard
    pHash algorithm used by
    the external
    ``imagehash`` library
    that ships with the
    project (already a
    transitive dependency
    via ``easyocr``). The
    previous 8x8 average-
    hash implementation was
    fast but fragile: a
    50x50 solid-white icon
    hashed to all-zero,
    causing every pair of
    "duplicate" icons to
    trigger an
    image_dup finding.

    Returns ``None`` for
    *degenerate* inputs so
    the detector can skip
    them rather than flag
    them as duplicates:

      * decode failure
        (corrupt / non-image
        bytes);
      * smaller than
        ``_MIN_PHASH_SIDE`` on
        either side (icons,
        thumbnails);
      * solid-color (single
        unique pixel value in
        the luminance plane).

    The detector treats
    ``None`` and ``""`` the
    same way (both falsy)
    so this is a drop-in
    change.
    """
    try:
        img = Image.open(
            io.BytesIO(image_bytes)
        )
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
    ):
        # Corrupt /
        # non-image
        # bytes --
        # downstream
        # code
        # would
        # crash
        # anyway.
        return None
    # Pillow's
    # ``convert``
    # silently
    # drops
    # alpha
    # and
    # returns a
    # copy;
    # safe to
    # mutate.
    img_l = img.convert("L")
    if (
        img_l.width < _MIN_PHASH_SIDE
        or img_l.height < _MIN_PHASH_SIDE
    ):
        # Too
        # small
        # for
        # pHash
        # to
        # be
        # meaningful.
        return None
    # Solid-color
    # guard: a
    # single
    # unique
    # luminance
    # value
    # means
    # the
    # image
    # is
    # blank.
    extrema = img_l.getextrema()
    if extrema is None or extrema[0] == extrema[1]:
        return None
    # R-2026-06-12: Frontiers (and some PLOS) papers embed
    # their figures as JPEG streams (``DCTDecode`` filter) so
    # the raw bytes we get from ``doc.extract_image`` are
    # already JPEG-encoded. Two visually-identical panels
    # that were saved with different JPEG quality settings
    # produce different pHashes, so the image_dup detector
    # misses the duplication on Frontiers cases. We
    # re-encode through PNG to normalize the encoding before
    # hashing. This is a tiny cost (one in-memory PNG save
    # per image) and the standard recommendation from the
    # pHash FAQ for handling JPEG-embedded scientific figures.
    if img.format and img.format.upper() in ("JPEG", "MPO", "JFIF"):
        try:
            buf = io.BytesIO()
            # ``optimize=True`` keeps the re-encoded PNG small.
            img_l.save(buf, format="PNG", optimize=True)
            img_l = Image.open(buf)
        except Exception:  # noqa: BLE001
            # Fall back to the in-memory grayscale image.
            pass
    # DCT-based
    # 64-bit
    # pHash.
    # ``imagehash.phash``
    # resizes
    # internally
    # to
    # 32x32.
    return str(imagehash.phash(img_l))


def _extract_exif(image_bytes: bytes) -> dict:
    """Best-effort EXIF read. Returns {} if the image has none."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()
        if not exif:
            return {}
        return {str(k): str(v) for k, v in exif.items()}
    except Exception:  # noqa: BLE001 — defensive, EXIF parsing is brittle
        return {}


def parse_pdf(pdf_path: Path, trace_id: str, workspace_dir: Path | None = None) -> ParsedDoc:
    """Open the PDF and pull out text, images, and metadata.

    If ``workspace_dir`` is given, every extracted raster is also
    written to ``<workspace_dir>/<trace_id>/steps/images/p{page}_{index}.{ext}``
    and its path stored on the resulting :class:`ExtractedImage`. This
    lets pixel-level detectors (ELA, copy-move) read the raw bytes
    without re-decoding the PDF.

    Raises:
        FileNotFoundError: ``pdf_path`` does not exist.
        RuntimeError: PDF is encrypted or otherwise unreadable.
    """
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)

    text_blocks: list[TextBlock] = []
    images: list[ExtractedImage] = []
    images_dir: Path | None = None
    if workspace_dir is not None:
        images_dir = _images_dir(trace_id, workspace_dir)

    with fitz.open(pdf_path) as doc:
        if doc.is_encrypted:
            raise RuntimeError("PDF is encrypted; ManuSift cannot read it")

        for page_index in range(len(doc)):
            page = doc[page_index]

            for block in page.get_text("blocks"):
                x0, y0, x1, y1, text, *_ = block
                text_blocks.append(
                    TextBlock(
                        page=page_index,
                        bbox=(float(x0), float(y0), float(x1), float(y1)),
                        text=text.strip(),
                    )
                )

            for img_index, img_info in enumerate(page.get_images(full=True)):
                xref = img_info[0]
                try:
                    base = doc.extract_image(xref)
                except Exception as exc:  # noqa: BLE001
                    log.warning(
                        "failed to extract image",
                        extra={"xref": xref, "err": str(exc)},
                    )
                    continue
                img_bytes = base["image"]
                width = base.get("width", 0)
                height = base.get("height", 0)
                phash = _compute_phash(img_bytes)
                exif = _extract_exif(img_bytes)

                # Persist raster for pixel-level detectors. Best-effort:
                # if disk write fails, the detector just won't fire on
                # this image and the rest of the pipeline keeps going.
                image_path: str | None = None
                if images_dir is not None:
                    ext = base.get("ext", "png")
                    out = images_dir / f"p{page_index:03d}_{img_index:03d}.{ext}"
                    try:
                        out.write_bytes(img_bytes)
                        image_path = str(out)
                    except OSError as exc:  # noqa: BLE001
                        log.warning(
                            "failed to persist extracted image",
                            extra={"path": str(out), "err": str(exc)},
                        )

                images.append(
                    ExtractedImage(
                        page=page_index,
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

        metadata = dict(doc.metadata or {})
        # Table extraction MUST run while ``doc`` is still open.
        # Previously this ran after the ``with fitz.open`` block,
        # so every table detector saw an empty ``doc.tables`` list
        # (closed-document accesses fail silently inside
        # ``_extract_tables`` best-effort handlers).
        tables = _extract_tables(
            doc, pdf_path, trace_id, workspace_dir
        )

    log.info(
        "pdf parsed",
        extra={
            "pages": len({b.page for b in text_blocks}) if text_blocks else 0,
            "images": len(images),
            "tables": len(tables),
        },
    )

    return ParsedDoc(
        trace_id=trace_id,
        source_path=str(pdf_path),
        text_blocks=text_blocks,
        images=images,
        metadata=metadata,
        tables=tables,
    )


def _extract_tables(
    pdf_doc: "fitz.Document",
    pdf_path: Path,
    trace_id: str,
    workspace_dir: Path | None,
) -> list["ExtractedTable"]:
    """Pull every tabular
    data source the
    pipeline can see
    into a single list
    of ``ExtractedTable``:

      1. **PDF-native + plumber tables** (P2)
         -- PyMuPDF
         ``page.find_tables()``
         plus optional
         pdfplumber
         gap-fill; captions
         like ``Fig. 3b``
         near the table set
         ``fig_name``.
      2. **Companion files**
         -- XLSX /
         CSV / TSV /
         JSON in
         ``<workspace>/<tid>/inputs/materials/``
         or in the
         same directory
         as the PDF.
         These are the
         real
         ``Source_Data_Fig*.xlsx``
         files authors
         upload to
         Nature /
         Science /
         etc.; without
         this step the
         table-stat
         detectors
         always see an
         empty list.
      3. **PDF-text stat
         extraction** (R-2026-06-15,
         Phase 4 T5) --
         for papers
         whose tables
         are image-only
         (Frontiers, most
         modern PDFs),
         the
         ``page.find_tables()``
         call returns
         nothing.  We
         therefore also
         walk the text
         layer looking
         for stat
         descriptors
         (``n=``, ``mean=``,
         ``p<``, ``±``,
         percentages) and
         assemble
         synthetic
         ``ExtractedTable``
         records with
         ``source_kind="pdf_text_stat"``.
         The downstream
         stat detectors
         (GRIM, p-value,
         percent) then
         have real
         numbers to work
         with even on a
         figure-only
         paper.

    The function is
    best-effort: an
    exception in either
    branch is logged and
    swallowed so a
    malformed
    companion file
    does not abort the
    pipeline.
    """
    out: list[ExtractedTable] = []
    # 1. PDF-native + pdfplumber tables with Fig/Table caption
    # alignment (P2). See manusift.ingest.pdf_tables.
    try:
        from .pdf_tables import extract_pdf_tables

        out.extend(
            extract_pdf_tables(pdf_doc, pdf_path)
        )
    except Exception as exc:  # noqa: BLE001
        log.info(
            "pdf table scan (native+plumber) failed",
            extra={"err": str(exc)},
        )
    # 2. Companion
    # files
    # (.xlsx /
    # .csv /
    # .tsv /
    # .json).
    # R-2026-06-17 (Phase 4 +
    # auto-discover
    # source data):
    # the
    # candidate
    # dirs
    # are
    # the
    # trace's
    # ``materials/``
    # (canonical)
    # and
    # ``pdf_path.parent``
    # (the
    # PDF's
    # own
    # directory,
    # used
    # as
    # a
    # fallback
    # for
    # ad-hoc
    # tests
    # that
    # do
    # not
    # go
    # through
    # ``ingest_from_path``).
    # When
    # a
    # ``materials/``
    # dir
    # exists,
    # we
    # skip
    # the
    # ``pdf_path.parent``
    # scan
    # to
    # avoid
    # double-counting
    # the
    # same
    # files
    # (the
    # originals
    # and
    # the
    # copies
    # in
    # materials
    # produce
    # two
    # tables
    # each
    # in
    # the
    # final
    # ``doc.tables``).
    candidate_dirs: list[Path] = []
    has_materials = False
    if workspace_dir is not None:
        m = workspace_dir / trace_id / "inputs" / "materials"
        if m.is_dir():
            candidate_dirs.append(m)
            has_materials = True
    if not has_materials:
        candidate_dirs.append(pdf_path.parent)
    seen: set[str] = set()
    from .xlsx import (
        discover_companion_files,
        parse_data_file,
    )
    for d in candidate_dirs:
        if not d.exists():
            continue
        for fp in discover_companion_files(
            d,
            extract_archives_to=d / "_archives",
        ):
            sp = str(fp.resolve())
            if sp in seen:
                continue
            seen.add(sp)
            try:
                tables = parse_data_file(fp)
            except Exception as exc:  # noqa: BLE001
                log.info(
                    "companion file parse failed",
                    extra={
                        "file": sp,
                        "err": str(exc),
                    },
                )
                continue
            out.extend(tables)
    # 3. PDF-text stat
    # extraction (T5).  We
    # always run this -- it is
    # a no-op when the text
    # layer has no stat
    # descriptors, and it
    # gives the downstream
    # stat detectors real
    # numbers to chew on when
    # the paper's tables are
    # image-only.
    try:
        from .table_extractor import (
            extract_tables_from_text,
        )
        # Re-use the text_blocks we already
        # extracted: the upper caller passes
        # ``text_blocks`` into ParsedDoc; we
        # re-walk the same PDF here because
        # ``_extract_tables`` does not have
        # direct access to the text_blocks
        # (they are computed in a separate
        # function).  A duplicate page-walk is
        # cheap (~100 ms for a 30-page paper).
        text_blocks_for_stat: list[TextBlock] = []
        try:
            for p_index in range(len(pdf_doc)):
                page = pdf_doc[p_index]
                try:
                    for b in (
                        page.get_text("blocks") or []
                    ):
                        if not b or len(b) < 5:
                            continue
                        x0, y0, x1, y1, text = b[:5]
                        if not text or not text.strip():
                            continue
                        text_blocks_for_stat.append(
                            TextBlock(
                                page=p_index + 1,
                                bbox=(x0, y0, x1, y1),
                                text=text,
                            )
                        )
                except Exception:  # noqa: BLE001
                    continue
        except Exception:  # noqa: BLE001
            text_blocks_for_stat = []
        stat_tables = extract_tables_from_text(
            text_blocks_for_stat,
            source_path=str(pdf_path),
        )
        if stat_tables:
            log.info(
                "pdf-text stat extraction: %d table(s) from %s",
                len(stat_tables),
                pdf_path.name,
            )
            out.extend(stat_tables)
    except Exception as exc:  # noqa: BLE001
        # T5 is best-effort; never let a text-regex
        # error abort the pipeline.
        log.info(
            "pdf-text stat extraction failed (best-effort): %s",
            exc,
        )
    return out
