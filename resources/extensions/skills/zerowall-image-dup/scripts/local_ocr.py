"""Offline-capable EasyOCR runner with resumable per-image receipts."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Iterable


_NUMBER = re.compile(r"(?<![A-Za-z0-9])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![A-Za-z0-9])")


def _sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _write_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def model_receipt(model_dir: Path) -> dict[str, Any]:
    files = []
    for path in sorted(model_dir.rglob("*.pth")) if model_dir.is_dir() else []:
        try:
            files.append({"model": path.stem, "relative_path": path.relative_to(model_dir).as_posix(),
                          "size": path.stat().st_size, "sha256": _sha256(path)})
        except OSError:
            continue
    return {"provider": "easyocr", "model_directory": str(model_dir),
            "checked_at": time.time(), "models": files,
            "available": bool(files)}


def scan(images: Iterable[dict[str, Any]], *, cache_dir: Path, model_dir: Path,
         deadline: float, enabled: bool = True) -> dict[str, Any]:
    records = [item for item in images if item.get("path") and Path(item["path"]).is_file()]
    result: dict[str, Any] = {"provider": "easyocr", "needed": len(records), "done": 0,
                              "failed": 0, "remaining": 0, "status": "done",
                              "reason": None, "records": [], "model": {}}
    if not enabled:
        result.update(provider="disabled", needed=0, status="not_applicable", reason="local OCR disabled")
        return result
    if not records:
        result.update(needed=0, status="not_applicable", reason="no raster images were available for OCR")
        return result
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)
    os.environ["EASYOCR_MODULE_PATH"] = str(model_dir)
    pending: list[dict[str, Any]] = []
    for image in records:
        path = Path(image["path"]).resolve()
        try:
            digest = _sha256(path)
        except OSError as error:
            result["failed"] += 1
            result["records"].append({**image, "status": "failed", "reason": str(error)})
            continue
        cache_path = cache_dir / (digest + ".json")
        if cache_path.is_file():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                cached.update({"source_file": image.get("source_file") or str(path),
                               "page": image.get("page"), "image_id": image.get("image_id")})
                if cached.get("status") == "done":
                    result["records"].append(cached)
                    result["done"] += 1
                    continue
            except Exception:  # noqa: BLE001
                pass
        pending.append({**image, "path": str(path), "digest": digest, "cache_path": cache_path})

    reader = None
    if pending and time.monotonic() < deadline:
        try:
            from manusift.local_ocr_runtime import get_reader
            reader, error = get_reader(("en",))
            if reader is None:
                raise RuntimeError(error or "EasyOCR reader unavailable")
        except Exception as error:  # noqa: BLE001
            result.update(failed=result["failed"] + len(pending), status="failed",
                          reason=f"EasyOCR model initialization failed: {error}")
            result["model"] = model_receipt(model_dir)
            return result

    for image in pending:
        if time.monotonic() >= deadline:
            break
        try:
            # OpenCV's filename decoder cannot read some Windows Unicode paths.
            # Passing decoded pixels also keeps OCR independent of the path codec.
            import numpy as np
            from PIL import Image
            with Image.open(image["path"]) as decoded:
                pixels = np.asarray(decoded.convert("RGB"))
            detected = reader.readtext(pixels, detail=1, paragraph=False)
            numbers = []
            text_hits = []
            for index, (polygon, text, confidence) in enumerate(detected):
                text = str(text).strip()
                conf = float(confidence)
                if not text:
                    continue
                xs = [float(point[0]) for point in polygon]
                ys = [float(point[1]) for point in polygon]
                bbox = [round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)]
                hit = {"index": index, "text": text, "confidence": conf, "bbox": bbox}
                text_hits.append(hit)
                if _NUMBER.search(text):
                    numbers.append(hit)
            saved = {"status": "done", "source_file": image.get("source_file") or image["path"],
                     "page": image.get("page"), "image_id": image.get("image_id"),
                     "sha256": image["digest"], "text": text_hits, "numbers": numbers}
            _write_json(image["cache_path"], saved)
            result["records"].append(saved)
            result["done"] += 1
        except Exception as error:  # noqa: BLE001
            saved = {"status": "failed", "source_file": image.get("source_file") or image["path"],
                     "page": image.get("page"), "image_id": image.get("image_id"),
                     "sha256": image["digest"], "reason": str(error), "numbers": []}
            _write_json(image["cache_path"], saved)
            result["records"].append(saved)
            result["failed"] += 1
    result["remaining"] = max(0, result["needed"] - result["done"] - result["failed"])
    result["status"] = "done" if result["remaining"] == 0 and result["failed"] == 0 else "incomplete" if result["remaining"] else "failed"
    result["model"] = model_receipt(model_dir)
    if result["failed"]:
        result["reason"] = "Some images could not be OCRed; numeric claims for them remain not evaluated."
    elif result["remaining"]:
        result["reason"] = "OCR budget reached; resume with the same trace ID."
    return result


def scan_isolated(images: Iterable[dict[str, Any]], *, cache_dir: Path, model_dir: Path,
                  deadline: float, enabled: bool = True, batch_size: int = 32) -> dict[str, Any]:
    """Release EasyOCR/PyTorch memory after each bounded group of images."""
    records = [item for item in images if item.get("path") and Path(item["path"]).is_file()]
    if not enabled or not records:
        return scan(records, cache_dir=cache_dir, model_dir=model_dir, deadline=deadline, enabled=enabled)
    cache_dir.mkdir(parents=True, exist_ok=True)
    failure = None
    for start in range(0, len(records), batch_size):
        remaining = deadline - time.monotonic()
        if remaining < 1:
            break
        token = uuid.uuid4().hex
        request = cache_dir / f"worker-{token}.input.json"
        response = cache_dir / f"worker-{token}.output.json"
        try:
            _write_json(request, {"images": records[start:start + batch_size],
                                  "cache_dir": str(cache_dir), "model_dir": str(model_dir),
                                  "deadline": deadline})
            process = subprocess.run([sys.executable, "-I", str(Path(__file__).resolve()),
                                      "--worker", str(request), str(response)],
                                     capture_output=True, text=True, encoding="utf-8", errors="replace",
                                     timeout=max(5, remaining + 5),
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if process.returncode:
                failure = process.stderr[-2000:] or f"OCR worker exited with {process.returncode}"
                break
            outcome = json.loads(response.read_text(encoding="utf-8"))
            if outcome.get("status") == "failed" and outcome.get("reason", "").startswith("EasyOCR model initialization failed"):
                failure = outcome["reason"]
                break
        except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError) as error:
            failure = f"OCR worker failed: {error}"
            break
        finally:
            request.unlink(missing_ok=True)
            response.unlink(missing_ok=True)
    # A deadline in the past reads receipts without loading the OCR model.
    result = scan(records, cache_dir=cache_dir, model_dir=model_dir,
                  deadline=time.monotonic() - 1, enabled=True)
    if failure:
        result["reason"] = failure
        result["status"] = "incomplete" if result["remaining"] else "failed"
    return result


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] != "--worker":
        raise SystemExit("usage: local_ocr.py --worker request.json response.json")
    sys.path.insert(0, str(Path(__file__).resolve().parent / "vendor"))
    payload = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    outcome = scan(payload["images"], cache_dir=Path(payload["cache_dir"]),
                   model_dir=Path(payload["model_dir"]), deadline=payload["deadline"])
    _write_json(Path(sys.argv[3]), {"status": outcome["status"], "reason": outcome["reason"]})
