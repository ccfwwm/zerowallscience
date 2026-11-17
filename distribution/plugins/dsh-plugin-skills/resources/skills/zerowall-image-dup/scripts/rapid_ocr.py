"""Figure OCR with content-addressed receipts and an explicit disabled state.

Coordinates use original image pixels. Rotated detections remain separate views,
not independent observations. A completed empty transcription is not a negative
scientific finding. Imported receipts are accepted only for matching image bytes.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from importlib.metadata import version
from pathlib import Path

SCHEMA = 1
NUMBER = re.compile(r"(?<![A-Za-z0-9])[-+]?(?:\d+)(?:\.\d+)?%?(?![A-Za-z0-9])")


def sha256(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def save(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def imported_records(path):
    """Index supported supplemental OCR receipts without trusting their file paths."""
    if not path:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    records = {}
    for row in payload.get("records", []):
        digest = row.get("source_sha256") or row.get("sha256")
        if not digest or row.get("status") not in {"done", "text_detected", "no_text_detected"}:
            continue
        hits = row.get("text")
        if hits is None:
            hits = []
            for view in row.get("views", []):
                for item in view.get("detections", []):
                    quad = item["original_pixel_quad"]
                    hits.append({"text": item["text"], "confidence": item["confidence"],
                                 "bbox": [min(p[0] for p in quad), min(p[1] for p in quad),
                                          max(p[0] for p in quad), max(p[1] for p in quad)],
                                 "rotation": view["rotation_ccw_degrees"]})
        if not isinstance(hits, list) or any(not isinstance(hit.get("text"), str) or
                len(hit.get("bbox", [])) != 4 for hit in hits):
            raise ValueError("OCR receipt contains invalid text coordinates")
        records[digest] = {"status": "done", "sha256": digest, "text": hits,
                           "numbers": [hit for hit in hits if NUMBER.search(hit["text"])],
                           "imported_from": str(Path(path).resolve()),
                           "provider": row.get("engine", payload.get("provider", "imported"))}
    return records


def scan(images, *, cache_dir, deadline, enabled=True, receipt=None, engine_factory=None):
    """Run RapidOCR on missing images; failed receipts are retried on resume."""
    images = list(images)
    result = {"provider": "rapidocr", "schema_version": SCHEMA, "needed": len(images),
              "done": 0, "failed": 0, "remaining": 0, "status": "done", "reason": None, "records": []}
    if not images:
        return {**result, "status": "not_applicable", "reason": "no raster images"}
    if not enabled:
        return {**result, "provider": "disabled", "status": "disabled", "remaining": len(images),
                "reason": "Figure OCR was explicitly disabled; figure text has not been evaluated."}
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    imported = imported_records(receipt)
    try:
        engine_version = version("rapidocr-onnxruntime")
    except Exception as error:
        # An imported receipt remains usable when the original engine is absent.
        if not imported and engine_factory is None:
            return {**result, "status": "failed", "failed": len(images), "reason": str(error)}
        engine_version = "external"
    result["engine_version"] = engine_version
    engine = None
    for image in images:
        row = {"source_file": image.get("source_file", image["path"]), "path": image["path"],
               "page": image.get("page"), "image_id": image.get("image_id")}
        if time.monotonic() >= deadline:
            break
        try:
            digest = sha256(image["path"])
            row["sha256"] = digest
            cache = cache_dir / (digest + "-" + engine_version + "-views0-90-v1.json")
            cached = imported.get(digest)
            if cached is None and cache.is_file():
                try:
                    cached = json.loads(cache.read_text(encoding="utf-8"))
                except (ValueError, OSError) as error:
                    # A corrupt cache is replaced only after fresh recognition succeeds.
                    cached = None
            if cached and cached.get("status") == "done" and cached.get("sha256") == digest:
                row.update(cached)
                row.update({key: image.get(key) for key in ("source_file", "page", "image_id")})
            else:
                if engine is None:
                    if engine_factory is None:
                        from rapidocr_onnxruntime import RapidOCR
                        engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=2)
                    else:
                        engine = engine_factory()
                import numpy as np
                from PIL import Image
                with Image.open(image["path"]) as original:
                    original = original.convert("RGB")
                    width, height = original.size
                    # Upscaling improves small figure letters without altering source bytes.
                    scale = min(3.0, max(1.0, 900 / max(width, height)))
                    resized = original.resize((round(width * scale), round(height * scale)))
                hits = []
                for rotation in (0, 90):
                    pixels = np.asarray(resized.rotate(rotation, expand=True))[:, :, ::-1].copy()
                    detected, _ = engine(pixels)
                    for quad, text, confidence in detected or []:
                        points = [(float(x) / scale, float(y) / scale) for x, y in quad]
                        if rotation == 90:
                            points = [(width - y, x) for x, y in points]
                        hits.append({"text": str(text), "confidence": float(confidence),
                                     "bbox": [min(x for x, _ in points), min(y for _, y in points),
                                              max(x for x, _ in points), max(y for _, y in points)],
                                     "rotation": rotation})
                row.update(status="done", text=hits, numbers=[hit for hit in hits if NUMBER.search(hit["text"])])
                save(cache, row)
            result["done"] += 1
        except Exception as error:
            row.update(status="failed", reason=str(error), text=[], numbers=[])
            result["failed"] += 1
        result["records"].append(row)
    result["remaining"] = len(images) - result["done"] - result["failed"]
    result["with_text"] = sum(bool(row.get("text")) for row in result["records"] if row["status"] == "done")
    result["without_text"] = result["done"] - result["with_text"]
    if result["failed"] or result["remaining"]:
        result["status"] = "incomplete" if result["remaining"] else "failed"
        result["reason"] = "Figure OCR is incomplete; resume the same task to retry missing or failed images."
    return result
