"""Local cross-paper image fingerprint index (P6.3).

Stores perceptual hashes (pHash hex) keyed by paper id so later
screens can flag **cross-paper** figure reuse without a commercial
image database. File format: JSONL under ``data/cache/image_fingerprints.jsonl``.

Each line::

    {"paper_id": "...", "phash": "a1b2...", "page": 0, "index": 1,
     "source": "main|si", "path": "optional display path", "ts": 0.0}

Query returns hits with Hamming distance ≤ threshold, excluding the
same ``paper_id`` (optional).
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

from ..workspace import cache_dir


def _index_path(workspace_jobs: Path | None = None) -> Path:
    """Default: sibling of jobs workspace → ``data/cache/...``."""
    override = (os.environ.get("MANUSIFT_FINGERPRINT_INDEX") or "").strip()
    if override:
        return Path(override)
    if workspace_jobs is not None:
        return cache_dir(workspace_jobs) / "image_fingerprints.jsonl"
    # Fallback relative to CWD
    return Path("data") / "cache" / "image_fingerprints.jsonl"


def hamming_hex(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    try:
        return bin(int(a, 16) ^ int(b, 16)).count("1")
    except ValueError:
        return 64


def load_records(path: Path | None = None) -> list[dict[str, Any]]:
    p = path or _index_path()
    if not p.is_file():
        return []
    out: list[dict[str, Any]] = []
    try:
        text = p.read_text(encoding="utf-8")
    except OSError:
        return []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(rec, dict) and rec.get("phash"):
            out.append(rec)
    return out


def append_records(
    records: Iterable[dict[str, Any]],
    *,
    path: Path | None = None,
) -> int:
    """Append fingerprint rows; returns count written."""
    p = path or _index_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with p.open("a", encoding="utf-8") as fh:
        for rec in records:
            if not rec.get("phash"):
                continue
            row = {
                "paper_id": str(rec.get("paper_id") or ""),
                "phash": str(rec["phash"]),
                "page": int(rec.get("page") or 0),
                "index": int(rec.get("index") or 0),
                "source": str(rec.get("source") or "main"),
                "path": str(rec.get("path") or ""),
                "ts": float(rec.get("ts") or time.time()),
            }
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    return n


def index_paper_images(
    *,
    paper_id: str,
    images: Iterable[Any],
    source: str = "main",
    path: Path | None = None,
) -> int:
    """Index all images with a pHash from a ParsedDoc.images list."""
    rows: list[dict[str, Any]] = []
    for img in images:
        ph = getattr(img, "phash", None)
        if not ph:
            continue
        w = int(getattr(img, "width", 0) or 0)
        h = int(getattr(img, "height", 0) or 0)
        if w < 64 or h < 64:
            continue
        rows.append(
            {
                "paper_id": paper_id,
                "phash": ph,
                "page": int(getattr(img, "page", 0) or 0),
                "index": int(getattr(img, "index", 0) or 0),
                "source": source,
                "path": str(getattr(img, "image_path", "") or ""),
            }
        )
    return append_records(rows, path=path)


def query_matches(
    phash: str,
    *,
    exclude_paper_id: str = "",
    max_hamming: int = 8,
    limit: int = 20,
    path: Path | None = None,
) -> list[dict[str, Any]]:
    """Nearest index hits for one pHash (excluding same paper)."""
    if not phash:
        return []
    hits: list[dict[str, Any]] = []
    for rec in load_records(path):
        if exclude_paper_id and str(rec.get("paper_id") or "") == exclude_paper_id:
            continue
        d = hamming_hex(phash, str(rec.get("phash") or ""))
        if d <= max_hamming:
            hits.append({**rec, "hamming": d})
    hits.sort(key=lambda r: (int(r["hamming"]), str(r.get("paper_id") or "")))
    return hits[:limit]
