"""Optional image-forensics backends (PhotoHolmes-style hooks).

P1: keep the default path pure OpenCV (SIFT / ELA / JPEG ghost).
External stacks such as PhotoHolmes can be plugged in via env
without making them a hard dependency.

Configuration
-------------
``MANUSIFT_IMAGE_BACKEND`` — comma-separated backend names or
import paths. Built-in names:

  * ``none`` / empty — no optional backends (default)
  * ``noop`` — dry-run backend that returns empty findings (tests)
  * ``module:path.to.factory`` — call factory() → backend instance

A backend implements::

    class Backend(Protocol):
        name: str
        def analyze(self, image_path: str, *, context: dict) -> list[dict]:
            ...

Each dict should look like a mini-finding::

    {
      "kind": "photoholmes_xxx",
      "severity": "low"|"medium"|"high",
      "title": "...",
      "evidence": "...",
      "raw": {...},
    }

Benchmark / evaluation hooks
----------------------------
``list_backend_names()`` and ``run_backends_on_path()`` are the
stable surface for RSIID / PhotoHolmes offline eval scripts.
"""
from __future__ import annotations

import importlib
import os
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

from ..trace import get_logger

log = get_logger(__name__)


@runtime_checkable
class ImageForensicsBackend(Protocol):
    """PhotoHolmes-style optional analyzer."""

    name: str

    def analyze(
        self,
        image_path: str,
        *,
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Return zero or more finding-like dicts for one image."""
        ...


@dataclass
class NoopBackend:
    """Dry-run backend for wiring tests (never flags)."""

    name: str = "noop"

    def analyze(
        self,
        image_path: str,
        *,
        context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return []


@dataclass
class BackendHit:
    """Normalized hit from an optional backend."""

    backend: str
    kind: str
    severity: str
    title: str
    evidence: str
    raw: dict[str, Any] = field(default_factory=dict)


def _parse_backend_spec() -> list[str]:
    raw = os.environ.get("MANUSIFT_IMAGE_BACKEND", "").strip()
    if not raw or raw.lower() in {"none", "off", "0"}:
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


def _load_one(spec: str) -> ImageForensicsBackend | None:
    key = spec.strip()
    if not key:
        return None
    low = key.lower()
    if low in {"noop", "null", "dry"}:
        return NoopBackend()
    if low in {"photoholmes", "photo_holmes", "ph"}:
        # Prefer our first-party adapter (handles missing install gracefully).
        try:
            from .photoholmes_backend import PhotoHolmesBackend

            return PhotoHolmesBackend()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "PhotoHolmes adapter failed to load",
                extra={"err": str(exc)},
            )
        for candidate in (
            "photoholmes:get_manusift_backend",
            "photoholmes.manusift:backend",
            "photoholmes:ManuSiftBackend",
        ):
            loaded = _load_import_path(candidate)
            if loaded is not None:
                return loaded
        log.info(
            "PhotoHolmes backend requested but package not usable; "
            "install from https://github.com/photoholmes/photoholmes "
            "or set MANUSIFT_IMAGE_BACKEND=module:path.to.factory"
        )
        return None
    if ":" in key or "." in key:
        return _load_import_path(key)
    log.warning("unknown image backend spec", extra={"spec": key})
    return None


def _load_import_path(path: str) -> ImageForensicsBackend | None:
    """Load ``module:attr`` or ``module.attr`` factory / class / instance."""
    try:
        if ":" in path:
            mod_name, attr = path.split(":", 1)
        else:
            parts = path.rsplit(".", 1)
            if len(parts) != 2:
                return None
            mod_name, attr = parts
        mod = importlib.import_module(mod_name)
        obj = getattr(mod, attr)
        if callable(obj) and not isinstance(obj, type):
            # factory function
            obj = obj()
        elif isinstance(obj, type):
            obj = obj()
        if not hasattr(obj, "analyze"):
            log.warning(
                "image backend missing analyze()",
                extra={"path": path},
            )
            return None
        if not getattr(obj, "name", None):
            try:
                obj.name = attr  # type: ignore[attr-defined]
            except Exception:  # noqa: BLE001
                pass
        return obj  # type: ignore[return-value]
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "image backend load failed",
            extra={"path": path, "err": str(exc)},
        )
        return None


def list_backend_names() -> list[str]:
    """Configured backend names (for CLI / benchmark harness)."""
    return list(_parse_backend_spec())


def get_optional_backends() -> list[ImageForensicsBackend]:
    """Instantiate backends from ``MANUSIFT_IMAGE_BACKEND``."""
    out: list[ImageForensicsBackend] = []
    seen: set[str] = set()
    for spec in _parse_backend_spec():
        b = _load_one(spec)
        if b is None:
            continue
        name = getattr(b, "name", spec)
        if name in seen:
            continue
        seen.add(name)
        out.append(b)
    return out


def run_backends_on_path(
    image_path: str,
    *,
    context: dict[str, Any] | None = None,
) -> list[BackendHit]:
    """Run all configured optional backends on one image path.

    Safe for offline RSIID / PhotoHolmes-style eval: exceptions are
    swallowed per backend so one plugin cannot kill the pipeline.
    """
    hits: list[BackendHit] = []
    for backend in get_optional_backends():
        name = getattr(backend, "name", "unknown")
        try:
            rows = backend.analyze(image_path, context=context or {})
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "image backend analyze failed",
                extra={"backend": name, "err": str(exc)},
            )
            continue
        if not rows:
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            sev = str(row.get("severity") or "low")
            if sev not in {"low", "medium", "high", "critical"}:
                sev = "low"
            hits.append(
                BackendHit(
                    backend=name,
                    kind=str(row.get("kind") or f"{name}_signal"),
                    severity=sev,
                    title=str(
                        row.get("title")
                        or f"Optional backend {name} signal"
                    ),
                    evidence=str(row.get("evidence") or ""),
                    raw={
                        **(row.get("raw") or {}),
                        "backend": name,
                        "source_kind": row.get("kind"),
                    },
                )
            )
    return hits
