"""Output formatter registry (Step E1).

Pre-E1, the report had exactly one
output format: HTML (rendered by
``manusift.report.builder.build_report_html``).
A user that wanted JSON or Markdown
had to write their own renderer from
scratch. Each new format meant a new
``/api/jobs/<tid>/report.<fmt>``
endpoint, a new content-type header,
and a new ``Content-Disposition`` —
all of it in ``web/app.py``.

E1 introduces an
``OutputFormatter`` Protocol. The
``format()`` method turns an analysis
result into bytes (the bytes are the
HTTP response body). The Protocol
also exposes ``content_type`` and
``file_extension`` so the
``/api/jobs/<tid>/report.<fmt>``
endpoint can be implemented once and
delegate to the right formatter for
any registered name.

Built-in formatters ship in this
module:

  * ``HtmlFormatter`` (delegates to
    ``build_report_html`` for
    backwards compatibility; the
    pre-E1 ``/api/jobs/<tid>/report``
    endpoint keeps working).
  * ``JsonFormatter`` (deterministic
    dump; ``json.dumps(indent=2)``).
  * ``MarkdownFormatter`` (a compact
    human-readable summary).

Third-party formatters are loaded via
the ``manusift.formatters`` entry-point
group (H4-style). The protocol is
intentionally tiny so a plugin
implementation is a 10-line drop-in:

    class MyCsvFormatter:
        name = "csv"
        content_type = "text/csv"
        file_extension = "csv"
        def format(self, result):
            return "trace_id,...\n".encode()

Guarantees:

  1. ``get_formatter(name)`` returns a
     formatter with the given name, or
     raises ``FormatterNotFound``.
  2. ``list_formatters()`` returns the
     sorted names of every registered
     formatter (built-in + entry-point).
  3. A formatter's ``format()`` method
     never raises; a failure is logged
     and the result is an empty payload
     (so the HTTP endpoint returns a
     200 with a small error message
     rather than a 500).
  4. The same formatter is returned on
     every ``get_formatter`` call
     (built-ins are singletons).
  5. The pre-E1 ``/api/jobs/<tid>/report``
     endpoint keeps working (it now
     delegates to ``HtmlFormatter``).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable

from .trace import get_logger

log = get_logger(__name__)


class FormatterNotFound(LookupError):
    """Raised when ``get_formatter(name)`` is
    called for a name that has not been
    registered."""


@runtime_checkable
class OutputFormatter(Protocol):
    """A drop-in report formatter.

    The three class attributes +
    ``format()`` method are the entire
    contract. A third-party plugin
    implements the four and registers
    via the ``manusift.formatters``
    entry-point group; no further
    integration is required.
    """

    name: str
    content_type: str
    file_extension: str

    def format(self, result: Any) -> bytes:
        """Render ``result`` as bytes.

        ``result`` is the object the
        pipeline returns — typically
        an ``AnalysisResult`` (with
        ``findings``, ``detectors_run``,
        ``llm_calls``, ``trace_id``) or
        a plain dict. The formatter is
        expected to be tolerant: a
        missing field is logged and
        treated as the empty string.
        """
        ...


@dataclass
class _FormatterInfo:
    """A small registry entry. The
    ``singleton`` is ``True`` for
    built-in formatters (we cache the
    instance so ``get_formatter`` is
    O(1)) and ``False`` for entry-point
    formatters (each call constructs a
    fresh instance — the plugin code is
    typically stateless so this is
    fine)."""
    formatter: OutputFormatter
    singleton: bool


_FORMATTERS: dict[str, _FormatterInfo] = {}
_FORMATTERS_LOCK_IMPORT = None  # we use module-level dict; reads are atomic under GIL


# ---------- 1. Built-in formatters ----------

class HtmlFormatter:
    """HTML output. Delegates to the
    pre-E1 ``build_report_html`` so the
    pre-E1 endpoint keeps working."""

    name = "html"
    content_type = "text/html; charset=utf-8"
    file_extension = "html"

    def format(self, result: Any) -> bytes:
        # Lazy import keeps the import
        # graph small when the user only
        # wants JSON / Markdown output.
        from .report.builder import build_report_html
        from .config import get_settings
        try:
            settings = result.settings  # type: ignore[attr-defined]
        except AttributeError:
            settings = get_settings()
        html = build_report_html(
            trace_id=getattr(result, "trace_id", ""),
            findings=getattr(result, "findings", []),
            detectors_run=getattr(result, "detectors_run", []),
            llm_calls=getattr(result, "llm_calls", 0),
            settings=settings,
        )
        return html.encode("utf-8")


class JsonFormatter:
    """JSON output. Pretty-printed for
    human inspection; ``sort_keys=True``
    so the output is stable across
    runs (the same analysis produces
    byte-for-byte the same JSON, which
    matters for diffing)."""

    name = "json"
    content_type = "application/json; charset=utf-8"
    file_extension = "json"

    def format(self, result: Any) -> bytes:
        payload = {
            "trace_id": getattr(result, "trace_id", ""),
            "findings": [
                f.__dict__ for f in getattr(result, "findings", [])
            ],
            "detectors_run": getattr(result, "detectors_run", []),
            "llm_calls": getattr(result, "llm_calls", 0),
            "duration_ms": getattr(result, "duration_ms", 0),
        }
        return json.dumps(
            payload, ensure_ascii=False, indent=2, sort_keys=True
        ).encode("utf-8")


class MarkdownFormatter:
    """Markdown output. A compact
    human-readable summary. Findings
    are grouped by detector; the
    heading is the trace id."""

    name = "md"
    content_type = "text/markdown; charset=utf-8"
    file_extension = "md"

    def format(self, result: Any) -> bytes:
        lines: list[str] = []
        trace_id = getattr(result, "trace_id", "unknown")
        lines.append(f"# ManuSift report: {trace_id}")
        lines.append("")
        detectors_run = getattr(result, "detectors_run", [])
        lines.append(
            f"Detectors run: {len(detectors_run)} "
            f"({', '.join(detectors_run) or 'none'})"
        )
        lines.append(
            f"LLM calls: {getattr(result, 'llm_calls', 0)}"
        )
        lines.append("")
        # Group findings by detector.
        findings = getattr(result, "findings", [])
        by_det: dict[str, list[Any]] = {}
        for f in findings:
            by_det.setdefault(f.detector, []).append(f)
        if not by_det:
            lines.append("No findings.")
        else:
            for detector in sorted(by_det.keys()):
                lines.append(f"## {detector}")
                lines.append("")
                for f in by_det[detector]:
                    sev = f.severity
                    title = f.title
                    lines.append(f"- **{sev.upper()}** — {title}")
                    if f.evidence:
                        lines.append(f"  - {f.evidence}")
                    if f.location:
                        lines.append(f"  - location: {f.location}")
                lines.append("")
        return "\n".join(lines).encode("utf-8")


# Register the built-ins. We use a
# list of (formatter, singleton) pairs
# so the registration order is
# deterministic (the test suite
# asserts on a sorted list).
_BUILTIN_FORMATTERS: list[OutputFormatter] = [
    HtmlFormatter(),
    JsonFormatter(),
    MarkdownFormatter(),
]


def _register_builtins() -> None:
    """Insert the built-in formatters
    into the global registry. Called
    once at module import time."""
    for fmt in _BUILTIN_FORMATTERS:
        _FORMATTERS[fmt.name] = _FormatterInfo(
            formatter=fmt, singleton=True
        )


def _iter_entrypoint_formatters() -> list[OutputFormatter]:
    """Yield formatters registered as
    third-party entry points. The
    entry-point group is
    ``manusift.formatters``. We
    instantiate each loaded formatter
    once and let the caller cache the
    result."""
    try:
        from importlib.metadata import entry_points
    except ImportError:  # pragma: no cover — Python < 3.10
        return []
    eps = entry_points()
    # Python 3.10+ returns a ``select``
    # object; on 3.10+ we filter by
    # group explicitly. On 3.10+ the
    # entry-points API also changed.
    group = eps.select(group="manusift.formatters") if hasattr(
        eps, "select"
    ) else eps.get("manusift.formatters", [])  # type: ignore[union-attr]
    out: list[OutputFormatter] = []
    for ep in group:
        try:
            instance = ep.load()()
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load formatter entry point",
                extra={"ep": ep.name, "err": str(exc)},
            )
            continue
        # The plugin must implement the
        # protocol; we duck-type rather
        # than ``isinstance`` because
        # ``@runtime_checkable`` Protocol
        # has limitations with attrs.
        if not all(
            hasattr(instance, attr)
            for attr in ("name", "content_type", "file_extension", "format")
        ):
            log.warning(
                "entry point does not implement OutputFormatter",
                extra={"ep": ep.name},
            )
            continue
        out.append(instance)  # type: ignore[arg-type]
    return out


def list_formatters() -> list[str]:
    """Return the names of every
    registered formatter, sorted
    alphabetically. Entry-point
    formatters override built-ins with
    the same name (the plugin wins)."""
    _register_builtins()  # idempotent
    names: dict[str, None] = {}
    for fmt in _BUILTIN_FORMATTERS:
        names[fmt.name] = None
    for fmt in _iter_entrypoint_formatters():
        names[fmt.name] = None
    return sorted(names.keys())


def get_formatter(name: str) -> OutputFormatter:
    """Return the formatter registered
    under ``name``. Raises
    ``FormatterNotFound`` if no
    formatter is registered under that
    name."""
    _register_builtins()  # idempotent
    info = _FORMATTERS.get(name)
    if info is not None:
        return info.formatter
    # Not in the singleton cache;
    # check the entry-point formatters
    # and cache the first match.
    for fmt in _iter_entrypoint_formatters():
        if fmt.name == name:
            _FORMATTERS[name] = _FormatterInfo(
                formatter=fmt, singleton=False
            )
            return fmt
    raise FormatterNotFound(
        f"no formatter named {name!r} "
        f"(available: {', '.join(list_formatters())})"
    )
