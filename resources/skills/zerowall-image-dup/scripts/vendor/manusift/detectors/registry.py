"""Detector plugin discovery (Step H4).

Borrowed design from the *OpenHands* agent registry: detectors
are discovered through Python's standard ``entry_points`` mechanism
so a third party can ship a detector as a separate package and
have it picked up automatically. A new detector module just needs
to::

    # my_plugin/__init__.py
    from manusift.detectors.base import DetectorResult
    from manusift.contracts import Finding, ParsedDoc


    class MyDetector:
        name = "my_detector"

        def run(self, doc):
            ...
            return DetectorResult(detector=self.name, ok=True, findings=...)

        def configure(self, settings):
            # E4 — drop-in plugin self-config.
            # The host app passes its global
            # settings as a dict; the plugin
            # picks the fields it cares about
            # and ignores the rest. A plugin
            # that does not implement
            # ``configure`` simply skips the
            # call (the loader duck-types
            # for the attribute).
            self._threshold = settings.get("my_threshold", 0.5)


    # my_plugin/pyproject.toml
    [project.entry-points."manusift.detectors"]
    my_detector = "my_plugin:MyDetector"

When that package is installed into the same environment as
ManuSift, the next ``load_detectors()`` call returns a list that
includes the third-party detector, with ``configure()`` already
called against the host's current settings.

We deliberately do NOT do this via a custom env var (e.g.
``MANUSIFT_DETECTORS=foo,bar``) — entry_points is the standard
Python answer, it survives environment reloads, and it documents
itself in the third-party package's own ``pyproject.toml``.

E4: ``configure(settings: dict) -> None`` is the new
self-config seam. A plugin that does not implement
``configure`` is not broken — the loader only calls
``configure`` on instances that expose the attribute.
"""
from __future__ import annotations

import logging
from importlib import metadata
from typing import Any, Iterable, Mapping

from .base import Detector

log = logging.getLogger(__name__)

ENTRY_POINT_GROUP = "manusift.detectors"


def iter_entrypoint_detectors(
    settings: Mapping[str, Any] | None = None,
) -> Iterable[Detector]:
    """Yield detector instances from installed entry points.

    Failures are logged and skipped — a broken third-party
    plugin must not stop the core pipeline. The contract for
    what a plugin looks like is intentionally minimal: any object
    that has a ``name: str`` attribute and a ``run(doc)`` method
    matching :class:`Detector`'s shape. We do not perform a
    runtime ``isinstance(det, Detector)`` check because entry
    points typically load a class, not an instance.

    E4: ``settings`` is the host app's global
    configuration as a dict. The loader
    calls ``instance.configure(settings)``
    on every loaded instance that
    exposes ``configure`` as an
    attribute. A plugin that does not
    implement ``configure`` is
    silently skipped (the call is
    guarded by ``hasattr``). A
    ``configure`` that raises is
    logged and the plugin is still
    yielded — the failure is in the
    plugin's config handling, not in
    the plugin's analysis path, so
    a user that wants to debug the
    plugin can still see its
    findings.
    """
    try:
        eps = metadata.entry_points(group=ENTRY_POINT_GROUP)
    except Exception as exc:  # noqa: BLE001 — entry_points has
        # many failure modes (corrupt .dist-info, version
        # mismatch, missing metadata). All of them are
        # "skip plugins", never "crash the app".
        log.warning(
            "could not load entry_points for %s",
            extra={"group": ENTRY_POINT_GROUP, "err": str(exc)},
        )
        return
    for ep in eps:
        try:
            cls_or_obj = ep.load()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load entry point",
                extra={"ep_name": ep.name, "ep_module": ep.value, "err": str(exc)},
            )
            continue
        # Accept either a class (the canonical pattern) or an
        # already-instantiated object. Detector() protocol only
        # requires ``name`` and ``run``; we duck-type.
        instance: Detector
        if isinstance(cls_or_obj, type):
            try:
                instance = cls_or_obj()  # type: ignore[abstract]
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "could not instantiate detector from entry point",
                    extra={"ep": ep.name, "err": str(exc)},
                )
                continue
        else:
            instance = cls_or_obj  # type: ignore[assignment]
        if not hasattr(instance, "name") or not hasattr(instance, "run"):
            log.warning(
                "entry point does not satisfy Detector protocol",
                extra={"ep": ep.name, "type": type(instance).__name__},
            )
            continue
        # E4: drop-in self-config. The
        # plugin can read whatever it
        # wants from the dict and
        # ignore the rest. We pass
        # ``None`` (not the empty dict)
        # when no settings were
        # supplied so a plugin can
        # distinguish "no settings
        # available" from "all settings
        # are defaults".
        if settings is not None and hasattr(instance, "configure"):
            try:
                instance.configure(dict(settings))
            except Exception as exc:  # noqa: BLE001
                # A failing ``configure`` is
                # the plugin's problem, not
                # the host's. Log and
                # continue so the user can
                # still use the plugin (its
                # default behavior is a
                # sensible fallback).
                log.warning(
                    "detector configure() raised",
                    extra={
                        "ep": ep.name,
                        "err": str(exc),
                    },
                )
        log.info(
            "loaded detector from entry point",
            extra={"ep": ep.name, "class": type(instance).__name__},
        )
        yield instance  # type: ignore[misc]


def entry_point_names() -> list[str]:
    """Return the names of detectors registered as entry points
    in the current environment. Used by the web layer's /progress
    endpoint to compute the canonical total_steps alongside the
    built-in detectors.
    """
    try:
        eps = metadata.entry_points(group=ENTRY_POINT_GROUP)
    except Exception:  # noqa: BLE001
        return []
    return [ep.name for ep in eps]
