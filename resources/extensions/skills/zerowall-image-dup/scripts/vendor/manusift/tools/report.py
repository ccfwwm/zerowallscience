"""Typed report contract for
``ToolContext.metadata``
(R-2026-06-15, Phase 1 +
P1-1.1).

GOAL_PROGRESS tech debt:
``ToolContext.metadata:
dict[str, Any]`` is the
single source of truth
for per-run state (data
sources, tool calls,
evidence assets,
session id, parsed
doc, conversation
state, pdf path, ...).
Every consumer reads
``ctx.metadata['...']``
and gets a raw
``Any``. This is fine
when the keys are
known, but it has
three problems:

  1. **No IDE/type
     support.** A typo
     (``"data_Source"``)
     silently returns
     ``None`` instead
     of a static check.
  2. **No schema
     documentation.**
     The key set is
     scattered across
     5 files.
  3. **No forward
     compat.** A
     future field
     ``"vector_store"``
     can collide with
     a key added by a
     detector.

This module introduces
``ToolReport`` — a
**frozen dataclass**
that mirrors the
well-known metadata
keys. It is a
**derived view** (no
storage migration
needed) computed from
``ToolContext.metadata``
on read. The original
``metadata`` dict
remains the source of
truth (so the 1500+
existing tests that
use
``ToolContext(trace_id="t")``
still work).

Usage::

    from manusift.tools.report import (
        ToolReport,
    )

    # The
    # frozen
    # dataclass
    # (the
    # 5
    # well-known
    # fields).
    @dataclass(frozen=True)
    class ToolReport:
        session_id: str | None = None
        pdf_path: str | None = None
        data_sources:
            tuple[DataSourceInfo, ...] = ()
        tool_calls:
            tuple[ToolCallRecord, ...] = ()
        evidence_assets:
            tuple[EvidenceAsset, ...] = ()
        parsed_doc: Any | None = None
        conversation_state:
            dict[str, Any] = field(
                default_factory=dict
            )

    # Read
    # from
    # a
    # ``ToolContext``:
    report = ToolReport.from_metadata(
        ctx.metadata
    )

    # Build
    # a
    # new
    # ``ToolContext``
    # from
    # a
    # report
    # + the
    # existing
    # fields:
    new_ctx = ctx.with_report(report)
"""
from __future__ import annotations

from dataclasses import (
    dataclass,
    field,
)
from typing import Any
from collections.abc import Mapping


# Well-known
# metadata
# keys. The
# ``ToolReport``
# is built by
# reading
# these
# keys. A
# typo
# or
# missing
# key
# yields
# the
# default
# value
# (``None``,
# ``()``,
# ``{}``).
KEY_SESSION_ID: str = "session_id"
KEY_PDF_PATH: str = "pdf_path"
KEY_DATA_SOURCES: str = "data_sources"
KEY_TOOL_CALLS: str = "tool_calls"
KEY_EVIDENCE_ASSETS: str = "evidence_assets"
KEY_PARSED_DOC: str = "parsed_doc"
KEY_CONVERSATION_STATE: str = (
    "conversation_state"
)


@dataclass(frozen=True)
class DataSourceInfo:
    """One row in
    ``ctx.metadata['data_sources']``.

    The shape is
    documented in
    ``data_audit.py`` and
    matches the existing
    dict-of-strings format
    that consumers expect.
    """

    id: str = ""
    format: str = ""
    path: str = ""

    @classmethod
    def from_dict(
        cls, d: Any
    ) -> "DataSourceInfo":
        """Coerce an arbitrary
        ``dict`` into a
        ``DataSourceInfo``.

        Defensive: an
        unknown / corrupt
        dict (or a non-dict,
        e.g. ``None``) yields a
        row with all-empty
        fields rather than
        raising. This keeps
        ``ToolReport`` cheap
        to build even when the
        metadata is from a
        stale session.
        """
        if not isinstance(d, dict):
            return cls()
        return cls(
            id=str(d.get("id", "") or ""),
            format=str(
                d.get("format", "") or ""
            ),
            path=str(d.get("path", "") or ""),
        )

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "format": self.format,
            "path": self.path,
        }


@dataclass(frozen=True)
class ToolCallRecord:
    """One row in
    ``ctx.metadata['tool_calls']``.

    The shape mirrors the
    audit-sink output
    (so a tool call
    recorded by the agent
    loop can be promoted
    to a report row with
    no extra marshaling).
    """

    name: str = ""
    input: dict[str, Any] = field(
        default_factory=dict
    )
    output: Any | None = None
    ok: bool = True
    error_kind: str = ""
    error: str = ""
    latency_ms: int = 0
    trace_id: str = ""
    ts_unix: float = 0.0

    @classmethod
    def from_dict(
        cls, d: Any
    ) -> "ToolCallRecord":
        if not isinstance(d, dict):
            return cls()
        return cls(
            name=str(d.get("name", "") or ""),
            input=dict(d.get("input", {}) or {}),
            output=d.get("output"),
            ok=bool(d.get("ok", True)),
            error_kind=str(
                d.get("error_kind", "") or ""
            ),
            error=str(d.get("error", "") or ""),
            latency_ms=int(
                d.get("latency_ms", 0) or 0
            ),
            trace_id=str(
                d.get("trace_id", "") or ""
            ),
            ts_unix=float(
                d.get("ts_unix", 0) or 0.0
            ),
        )


@dataclass(frozen=True)
class EvidenceAsset:
    """One row in
    ``ctx.metadata['evidence_assets']``.

    The shape mirrors the
    ``EvidenceManifest`` row
    (so a tool can promote
    a finding's evidence
    into a report row with
    no extra marshaling).
    """

    path: str = ""
    kind: str = ""
    caption: str = ""
    trace_id: str = ""

    @classmethod
    def from_dict(
        cls, d: Any
    ) -> "EvidenceAsset":
        if not isinstance(d, dict):
            return cls()
        return cls(
            path=str(d.get("path", "") or ""),
            kind=str(d.get("kind", "") or ""),
            caption=str(
                d.get("caption", "") or ""
            ),
            trace_id=str(
                d.get("trace_id", "") or ""
            ),
        )


@dataclass(frozen=True)
class ToolReport:
    """Typed view of
    ``ToolContext.metadata``.

    The dataclass is
    frozen and has no
    storage of its own: it
    is **derived** from a
    dict on read via
    ``from_metadata``. The
    original ``metadata``
    dict remains the source
    of truth, so the
    dataclass is a
    read-side / write-side
    helper, not a
    migration.

    The 7 well-known keys
    are listed in the
    module-level constants
    (``KEY_SESSION_ID``,
    ...). Unknown keys in
    the metadata are
    preserved on
    ``with_report`` so
    the dataclass does NOT
    silently drop them
    (defensive: a future
    field added by a
    detector still flows
    through).
    """

    session_id: str | None = None
    pdf_path: str | None = None
    data_sources: tuple[
        DataSourceInfo, ...
    ] = ()
    tool_calls: tuple[
        ToolCallRecord, ...
    ] = ()
    evidence_assets: tuple[
        EvidenceAsset, ...
    ] = ()
    parsed_doc: Any | None = None
    conversation_state: dict[
        str, Any
    ] = field(default_factory=dict)

    @classmethod
    def empty(cls) -> "ToolReport":
        return cls()

    @classmethod
    def from_metadata(
        cls, metadata: Any
    ) -> "ToolReport":
        """Build a
        ``ToolReport`` from a
        metadata dict
        (best-effort: missing
        keys yield the
        default value;
        corrupt values are
        coerced to a safe
        empty form).

        The contract:

          * ``metadata=None``
            or an empty
            dict
            -> all
            defaults.

          * Missing
            keys
            are
            tolerated.

          * A
            ``data_sources``
            row
            that
            is
            not
            a
            dict
            (e.g.
            ``None``
            or
            a
            string)
            becomes
            a
            ``DataSourceInfo()``
            with
            all-empty
            fields
            (not
            an
            error).

          * ``conversation_state``
            that
            is
            not
            a
            dict
            becomes
            an
            empty
            dict.

          * The
            parser
            never
            raises;
            a
            corrupt
            metadata
            is
            the
            tool
            loop's
            problem,
            not
            the
            reporter's.
        """
        md = metadata or {}
        if not isinstance(md, Mapping):
            md = {}
        # Coerce
        # each
        # well-known
        # key.
        session_id = md.get(KEY_SESSION_ID)
        pdf_path = md.get(KEY_PDF_PATH)
        raw_ds = md.get(KEY_DATA_SOURCES) or []
        if not isinstance(raw_ds, list):
            raw_ds = []
        data_sources = tuple(
            DataSourceInfo.from_dict(d)
            for d in raw_ds
        )
        raw_tc = md.get(KEY_TOOL_CALLS) or []
        if not isinstance(raw_tc, list):
            raw_tc = []
        tool_calls = tuple(
            ToolCallRecord.from_dict(d)
            for d in raw_tc
        )
        raw_ea = md.get(KEY_EVIDENCE_ASSETS) or []
        if not isinstance(raw_ea, list):
            raw_ea = []
        evidence_assets = tuple(
            EvidenceAsset.from_dict(d)
            for d in raw_ea
        )
        parsed_doc = md.get(KEY_PARSED_DOC)
        cs = md.get(KEY_CONVERSATION_STATE) or {}
        if not isinstance(cs, dict):
            cs = {}
        return cls(
            session_id=(
                str(session_id)
                if session_id is not None
                else None
            ),
            pdf_path=(
                str(pdf_path)
                if pdf_path is not None
                else None
            ),
            data_sources=data_sources,
            tool_calls=tool_calls,
            evidence_assets=evidence_assets,
            parsed_doc=parsed_doc,
            conversation_state=dict(cs),
        )

    def to_metadata(self) -> dict[str, Any]:
        """Return a metadata
        dict that round-trips
        through
        ``from_metadata``.

        Unknown keys are NOT
        emitted (we only
        round-trip the 7
        well-known ones; a
        full round-trip would
        require a separate
        ``extras`` dict).
        """
        out: dict[str, Any] = {}
        if self.session_id is not None:
            out[KEY_SESSION_ID] = self.session_id
        if self.pdf_path is not None:
            out[KEY_PDF_PATH] = self.pdf_path
        if self.data_sources:
            out[KEY_DATA_SOURCES] = [
                d.to_dict() for d in self.data_sources
            ]
        if self.tool_calls:
            out[KEY_TOOL_CALLS] = [
                self._tool_call_to_dict(t)
                for t in self.tool_calls
            ]
        if self.evidence_assets:
            out[KEY_EVIDENCE_ASSETS] = [
                {
                    "path": a.path,
                    "kind": a.kind,
                    "caption": a.caption,
                    "trace_id": a.trace_id,
                }
                for a in self.evidence_assets
            ]
        if self.parsed_doc is not None:
            out[KEY_PARSED_DOC] = self.parsed_doc
        if self.conversation_state:
            out[KEY_CONVERSATION_STATE] = (
                dict(self.conversation_state)
            )
        return out

    @staticmethod
    def _tool_call_to_dict(
        t: ToolCallRecord,
    ) -> dict[str, Any]:
        out: dict[str, Any] = {
            "name": t.name,
            "input": dict(t.input),
            "ok": t.ok,
        }
        if t.output is not None:
            out["output"] = t.output
        if t.error_kind:
            out["error_kind"] = t.error_kind
        if t.error:
            out["error"] = t.error
        if t.latency_ms:
            out["latency_ms"] = t.latency_ms
        if t.trace_id:
            out["trace_id"] = t.trace_id
        if t.ts_unix:
            out["ts_unix"] = t.ts_unix
        return out

    def with_merge(
        self, other: "ToolReport"
    ) -> "ToolReport":
        """Merge two reports.

        Semantics:

          * Scalar
            fields
            (session_id,
            pdf_path,
            parsed_doc,
            conversation_state)
            use
            ``other``'s
            value
            if
            set,
            else
            ``self``'s.
          * List
            fields
            (data_sources,
            tool_calls,
            evidence_assets)
            are
            concatenated
            (``self``
            then
            ``other``).

        The merge is
        used by
        ``conversation_state.with_state``
        so a new report
        can be merged with
        the in-flight report
        rather than
        overwriting it.
        """
        return ToolReport(
            session_id=(
                other.session_id
                if other.session_id is not None
                else self.session_id
            ),
            pdf_path=(
                other.pdf_path
                if other.pdf_path is not None
                else self.pdf_path
            ),
            data_sources=(
                self.data_sources
                + other.data_sources
            ),
            tool_calls=(
                self.tool_calls + other.tool_calls
            ),
            evidence_assets=(
                self.evidence_assets
                + other.evidence_assets
            ),
            parsed_doc=(
                other.parsed_doc
                if other.parsed_doc is not None
                else self.parsed_doc
            ),
            conversation_state={
                **self.conversation_state,
                **other.conversation_state,
            },
        )


def with_report(
    ctx_metadata: dict[str, Any],
    report: ToolReport,
    *,
    preserve_unknown: bool = True,
) -> dict[str, Any]:
    """Return a NEW
    metadata dict that
    combines the well-known
    fields from ``report``
    with the original
    ``ctx_metadata``.

    If
    ``preserve_unknown``
    is True (the default),
    unknown keys in the
    original
    ``ctx_metadata`` are
    preserved verbatim. If
    False, the result is
    just
    ``report.to_metadata()``
    (the 7 well-known
    fields only).

    The original
    ``ctx_metadata`` is
    NOT mutated. Tools can
    safely do::

        ctx = dataclasses.replace(
            ctx,
            metadata=with_report(
                ctx.metadata, new_report
            ),
        )
    """
    base = report.to_metadata()
    if not preserve_unknown:
        return base
    # Start
    # with
    # the
    # original
    # dict
    # (so
    # unknown
    # keys
    # win
    # by
    # default),
    # then
    # overlay
    # the
    # 7
    # well-known
    # fields
    # from
    # ``report``.
    out: dict[str, Any] = dict(ctx_metadata)
    out.update(base)
    return out
