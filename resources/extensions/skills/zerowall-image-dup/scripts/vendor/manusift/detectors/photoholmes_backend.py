"""PhotoHolmes optional backend adapter (P1).

PhotoHolmes is **not** a hard dependency. When installed
(``pip install -e path/to/photoholmes`` or future PyPI), set::

    MANUSIFT_IMAGE_BACKEND=photoholmes

This adapter tries, in order:

1. Explicit ManuSift hook: ``photoholmes.get_manusift_backend``
2. MethodFactory methods listed in ``MANUSIFT_PHOTOHOLMES_METHODS``
   (default: lightweight residual / noise methods if present)
3. CLI: ``photoholmes run <method> --output-folder <tmp> <image>``

Heatmaps / score maps are collapsed to a single finding when the
peak residual exceeds ``MANUSIFT_PHOTOHOLMES_SCORE_THR`` (default 0.55).

RSIID / RSIIL offline calibration is handled by
:mod:`manusift.detectors.image_calibration` — thresholds live in a
JSON file and can override the score thr at runtime.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from ..trace import get_logger

log = get_logger(__name__)

_DEFAULT_METHODS = "zero,noiseprint,catnet,trufor"
_SCORE_THR = float(os.environ.get("MANUSIFT_PHOTOHOLMES_SCORE_THR", "0.55"))


def _score_threshold() -> float:
    # Prefer calibrated thr if present
    try:
        from .image_calibration import load_calibration

        cal = load_calibration()
        if cal and "photoholmes_score_thr" in cal:
            return float(cal["photoholmes_score_thr"])
    except Exception:  # noqa: BLE001
        pass
    return float(os.environ.get("MANUSIFT_PHOTOHOLMES_SCORE_THR", str(_SCORE_THR)))


def _method_names() -> list[str]:
    raw = os.environ.get("MANUSIFT_PHOTOHOLMES_METHODS", _DEFAULT_METHODS)
    return [m.strip().lower() for m in raw.split(",") if m.strip()]


def _heatmap_peak(arr: Any) -> float | None:
    """Best-effort max of a numpy / torch / list heatmap."""
    try:
        import numpy as np

        a = np.asarray(arr, dtype=float)
        if a.size == 0:
            return None
        # Normalise if looks like 0-255
        mx = float(a.max())
        if mx > 1.5:
            mx = mx / 255.0
        return mx
    except Exception:  # noqa: BLE001
        return None


def _try_method_factory(image_path: str) -> list[dict[str, Any]]:
    """Run PhotoHolmes MethodFactory methods if importable."""
    try:
        from photoholmes.methods.factory import (  # type: ignore
            MethodFactory,
            MethodRegistry,
        )
    except Exception as exc:  # noqa: BLE001
        log.debug("photoholmes MethodFactory unavailable: %s", exc)
        return []

    # Build name → enum mapping from registry if possible
    registry_names: dict[str, Any] = {}
    try:
        for item in MethodRegistry:
            registry_names[str(item.name).lower()] = item
            registry_names[str(item.value).lower() if hasattr(item, "value") else ""] = (
                item
            )
    except Exception:  # noqa: BLE001
        pass

    hits: list[dict[str, Any]] = []
    thr = _score_threshold()
    for name in _method_names():
        enum = registry_names.get(name)
        if enum is None:
            # try common aliases
            for k, v in registry_names.items():
                if name in k or k in name:
                    enum = v
                    break
        if enum is None:
            continue
        try:
            method, preprocess = MethodFactory.load(enum)
        except Exception as exc:  # noqa: BLE001
            log.debug("photoholmes load %s failed: %s", name, exc)
            continue
        try:
            # Common API: method.predict(image) or method(image)
            from PIL import Image
            import numpy as np

            img = np.asarray(Image.open(image_path).convert("RGB"))
            if preprocess is not None:
                try:
                    img = preprocess(img)
                except Exception:  # noqa: BLE001
                    pass
            out = None
            for call in (
                lambda: method.predict(img),
                lambda: method(img),
                lambda: method.run(img),
            ):
                try:
                    out = call()
                    break
                except Exception:  # noqa: BLE001
                    continue
            if out is None:
                continue
            # Extract heatmap / score
            peak = None
            if isinstance(out, dict):
                for key in (
                    "heatmap",
                    "score_map",
                    "mask",
                    "prediction",
                    "score",
                ):
                    if key not in out:
                        continue
                    val = out[key]
                    if isinstance(val, (int, float)):
                        peak = float(val)
                        break
                    peak = _heatmap_peak(val)
                    if peak is not None:
                        break
            else:
                peak = _heatmap_peak(out)
            if peak is None:
                continue
            if peak < thr:
                continue
            sev = "high" if peak >= thr * 1.4 else "medium"
            hits.append(
                {
                    "kind": f"photoholmes_{name}",
                    "severity": sev,
                    "title": (
                        f"PhotoHolmes/{name} residual peak={peak:.3f} "
                        f"(thr={thr:.2f})"
                    ),
                    "evidence": (
                        f"Optional PhotoHolmes method '{name}' reported a "
                        f"peak score of {peak:.3f} on this image. This is a "
                        "candidate splice/copy-move signal for manual review; "
                        "not a standalone misconduct verdict."
                    ),
                    "raw": {
                        "method": name,
                        "peak_score": peak,
                        "threshold": thr,
                        "source": "method_factory",
                    },
                }
            )
        except Exception as exc:  # noqa: BLE001
            log.debug("photoholmes run %s failed: %s", name, exc)
            continue
        # Cap methods to avoid long GPU runs in batch
        if len(hits) >= 3:
            break
    return hits


def _try_cli(image_path: str) -> list[dict[str, Any]]:
    """Invoke ``photoholmes run <method>`` if the CLI is on PATH."""
    exe = shutil.which("photoholmes")
    if not exe:
        return []
    thr = _score_threshold()
    hits: list[dict[str, Any]] = []
    for name in _method_names()[:2]:
        with tempfile.TemporaryDirectory(prefix="ms_ph_") as tmp:
            cmd = [
                exe,
                "run",
                name,
                "--output-folder",
                tmp,
                image_path,
            ]
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=int(
                        os.environ.get("MANUSIFT_PHOTOHOLMES_TIMEOUT", "120")
                    ),
                    check=False,
                )
            except Exception as exc:  # noqa: BLE001
                log.debug("photoholmes CLI failed: %s", exc)
                continue
            # Scan tmp for any json/png scores
            peak = None
            for p in Path(tmp).rglob("*"):
                if p.suffix.lower() in {".json", ".txt"}:
                    try:
                        text = p.read_text(encoding="utf-8", errors="ignore")
                        data = json.loads(text) if p.suffix == ".json" else None
                        if isinstance(data, dict):
                            for k in ("score", "peak", "max", "auroc"):
                                if k in data and isinstance(
                                    data[k], (int, float)
                                ):
                                    peak = float(data[k])
                                    break
                        if peak is None:
                            # plain number file
                            for line in text.splitlines():
                                try:
                                    peak = float(line.strip())
                                    break
                                except ValueError:
                                    continue
                    except Exception:  # noqa: BLE001
                        continue
                if peak is not None:
                    break
            if peak is None and proc.returncode == 0:
                # CLI ran but no score — still surface low info breadcrumb
                hits.append(
                    {
                        "kind": f"photoholmes_{name}_ran",
                        "severity": "low",
                        "title": f"PhotoHolmes CLI '{name}' completed (no score)",
                        "evidence": (
                            "PhotoHolmes CLI finished without a parseable "
                            "score map. Inspect output folder artifacts "
                            "offline if needed."
                        ),
                        "raw": {
                            "method": name,
                            "source": "cli",
                            "returncode": proc.returncode,
                        },
                    }
                )
                continue
            if peak is not None and peak >= thr:
                sev = "high" if peak >= thr * 1.4 else "medium"
                hits.append(
                    {
                        "kind": f"photoholmes_{name}",
                        "severity": sev,
                        "title": (
                            f"PhotoHolmes CLI/{name} peak={peak:.3f}"
                        ),
                        "evidence": (
                            f"CLI method '{name}' peak score {peak:.3f}."
                        ),
                        "raw": {
                            "method": name,
                            "peak_score": peak,
                            "threshold": thr,
                            "source": "cli",
                        },
                    }
                )
    return hits


class PhotoHolmesBackend:
    """ManuSift-facing PhotoHolmes adapter."""

    name = "photoholmes"

    def analyze(
        self,
        image_path: str,
        *,
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        if not image_path or not Path(image_path).is_file():
            return []
        hits = _try_method_factory(image_path)
        if hits:
            return hits
        return _try_cli(image_path)


def get_manusift_backend() -> PhotoHolmesBackend:
    """Factory entry used by ``image_backends`` soft-import paths."""
    return PhotoHolmesBackend()
