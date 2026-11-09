"""Cross-paper image reuse against the local fingerprint index (P6.3).

Compares current PDF figure pHashes to ``data/cache/image_fingerprints.jsonl``.
Does not require network or commercial DBs. Empty index → no findings.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from ..contracts import Finding, ParsedDoc
from .base import DetectorResult


def _enabled() -> bool:
    raw = (os.environ.get("MANUSIFT_CROSS_PAPER_IMAGE") or "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


_GENERIC_PAPER_IDS = frozenset(
    {
        "original",
        "paper",
        "main",
        "document",
        "file",
        "image",
        "inputs",
        "workspace",
        "manusift_run",
        "materials",
        "",
    }
)


def _looks_like_trace_id(value: str) -> bool:
    v = (value or "").strip().lower()
    if len(v) < 10 or len(v) > 40:
        return False
    return all(c in "0123456789abcdef" for c in v)


def _paper_id(doc: ParsedDoc) -> str:
    """Stable paper key shared with pipeline auto-index.

    Prefer DOI / title. Never fall back to bare ``original`` (smoke
    copies PDF to ``inputs/original.pdf``) — that collided every
    control paper into one index bucket (negative_controls_v1 FP).
    """
    meta = getattr(doc, "metadata", None) or {}
    for key in ("doi", "DOI"):
        v = str(meta.get(key) or "").strip()
        if v:
            return v[:200]
    for key in ("title", "Title"):
        v = str(meta.get(key) or "").strip()
        if len(v) >= 12:
            return v[:200]
    sp = Path(str(getattr(doc, "source_path", "") or ""))
    for part in (
        sp.parent.name,
        sp.parent.parent.name,
        sp.parent.parent.parent.name,
        sp.stem,
    ):
        p = str(part or "").strip()
        if p.lower() in _GENERIC_PAPER_IDS:
            continue
        if _looks_like_trace_id(p):
            continue
        if p:
            return p[:200]
    tid = str(getattr(doc, "trace_id", "") or "").strip()
    # Prefer a non-trace fallback so re-runs of the same PDF share a key.
    return f"path:{sp}"[:200] if sp.name else (tid[:200] if tid else "unknown")
class CrossPaperImageDetector:
    """Flag figures whose pHash matches another paper in the local index."""

    name = "cross_paper_image"

    def run(self, doc: ParsedDoc) -> DetectorResult:
        if not _enabled():
            return DetectorResult(
                detector=self.name, findings=[], ok=True
            )
        from ..knowledge.fingerprint_index import query_matches

        paper_id = _paper_id(doc)
        findings: list[Finding] = []
        max_h = int(os.environ.get("MANUSIFT_CROSS_PAPER_HAMMING", "6") or "6")
        max_findings = int(
            os.environ.get("MANUSIFT_CROSS_PAPER_MAX_FINDINGS", "25") or "25"
        )
        thr_high = int(
            os.environ.get("MANUSIFT_CROSS_PAPER_HIGH_HAMMING", "2") or "2"
        )

        for img in doc.images or []:
            if len(findings) >= max_findings:
                break
            ph = getattr(img, "phash", None)
            if not ph:
                continue
            w = int(getattr(img, "width", 0) or 0)
            h = int(getattr(img, "height", 0) or 0)
            if w < 64 or h < 64:
                continue
            hits = query_matches(
                ph,
                exclude_paper_id=paper_id,
                max_hamming=max_h,
                limit=8,
            )
            # Drop generic / empty / trace-id paper_id rows (legacy smoke
            # index noise) and publisher-furniture near-matches.
            cleaned: list[dict[str, Any]] = []
            for hit in hits:
                pid = str(hit.get("paper_id") or "").strip()
                if pid.lower() in _GENERIC_PAPER_IDS:
                    continue
                if _looks_like_trace_id(pid):
                    continue
                cleaned.append(hit)
            hits = cleaned
            if not hits:
                continue
            best = hits[0]
            d = int(best["hamming"])
            # Exact pHash + substantial raster → high; near-match or
            # small journal chrome → medium (neg-controls: BMC logo
            # pairs across OA papers were high with d=0 on tiny assets).
            img_h = h  # height (avoid clobber from loop vars)
            substantial = (
                w >= 180
                and img_h >= 120
                and int(getattr(img, "bytes_size", 0) or 0) >= 15 * 1024
            )
            if d == 0 and substantial:
                sev = "high"
            else:
                sev = "medium"
            other = str(best.get("paper_id") or "?")
            findings.append(
                Finding.make(
                    trace_id=doc.trace_id,
                    detector=self.name,
                    severity=sev,  # type: ignore[arg-type]
                    title=(
                        f"Cross-paper image match (pHash d={d}) "
                        f"vs «{other[:60]}»"
                    ),
                    location=(
                        f"Page {int(img.page) + 1} / image {int(img.index)}"
                    ),
                    evidence=(
                        f"Local fingerprint index hit: Hamming {d} "
                        f"(≤{max_h}) against paper_id={other!r} "
                        f"page={best.get('page')} index={best.get('index')} "
                        f"source={best.get('source')}. Suggests figure reuse "
                        f"across publications; verify manually."
                    ),
                    raw={
                        "check": "cross_paper_phash",
                        "hamming": d,
                        "paper_id": paper_id,
                        "matched_paper_id": other,
                        "matched_page": best.get("page"),
                        "matched_index": best.get("index"),
                        "matched_source": best.get("source"),
                        "phash": ph,
                        "substantial_image": substantial,
                        "pubpeer_pattern": "image_cross_paper_reuse",
                        "image_a": {
                            "page": img.page,
                            "index": img.index,
                            "width": w,
                            "height": h,
                        },
                    },
                )
            )
        return DetectorResult(
            detector=self.name,
            findings=findings,
            ok=True,
            stats={"paper_id": paper_id, "n_hits": len(findings)},
        )
