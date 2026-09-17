"""Tool Protocol (Step J1).

Agent-callable domain tools expose four members: ``name``,
``description``, ``inputSchema``, and ``execute``. Implemented as a
Python ``Protocol`` so any class with the right shape — including
existing detectors — qualifies without inheriting from a base class.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field, replace
from types import MappingProxyType
from typing import Any, Mapping, Protocol, runtime_checkable


@dataclass(frozen=True)
class ToolContext:
    """Per-run state passed to every tool execute() call.

    A tool that needs the current PDF can read
    ``ctx.current_pdf``; a tool that wants to log under the
    right trace id can use ``ctx.trace_id``. The dataclass is
    frozen so tools cannot accidentally mutate shared state.

    R-2026-06-15 (Phase 1 + P1-1.1):
    the ``report`` property
    exposes a typed view
    over ``metadata`` (the
    7 well-known fields:
    session id, pdf path,
    data sources, tool
    calls, evidence
    assets, parsed doc,
    conversation state).
    ``metadata`` remains
    the source of truth so
    the 1500+ existing
    tests that construct
    ``ToolContext(trace_id="t")``
    still work; the
    ``report`` property is
    a derived view only.

    R-2026-06-15 (Phase 1 + P1-20):
    **no-secrets policy**.
    The ``metadata`` field is
    logged in:
      * the audit log (one
        row per tool call, full
        ``ToolResult.to_dict()``
        serialised);
      * the TUI debug drawer
        (the user can dump
        ``ctx.metadata`` for
        the current turn);
      * the chat-session
        persistence layer
        (pickle on disk);
      * the report renderer
        (HTML / Markdown
        artefacts written
        to the workspace);
      * the test fixtures
        (any test that
        asserts on
        ``ctx.metadata``
        will print the
        value to stdout on
        failure).

    **Do NOT put secrets in
    ``metadata``.**
    ``metadata`` is
    serialised, logged, and
    re-serialised dozens of
    times in a single
    session.  An API key
    that lands in
    ``metadata`` ends up in
    the chat-history pickle
    (which the user can share
    with a colleague or paste
    into a bug report),
    the report HTML (which is
    a regular file on disk),
    and the audit log
    (which is *also* a regular
    file on disk).

    If a tool needs a
    secret, the secret
    belongs in:

      1. ``Settings.openai_api_key``
         (loaded from
         ``MANUSIFT_OPENAI_API_KEY``
         env var, never
         serialised);
      2. The env var directly
         (``os.environ["FOO"]``);
      3. A *new* typed
         ``ToolContext`` field
         (``@dataclass(frozen=True)``)
         that the audit log
         knows to redact.

    If you find yourself
    wanting to put a secret
    in ``metadata``, **stop
    and add a new
    ``ToolContext`` field**
    instead.  The
    ``redact_metadata`` audit
    log filter (see
    ``manusift/audit.py``)
    redacts any key whose
    name matches
    ``(?i)(api[_-]?key|secret|token|password)``
    so a misplaced secret is
    *not* leaked, but the
    audit log will spam
    ``[REDACTED]`` and
    the test fixtures will
    show ``[REDACTED]``
    instead of useful
    diagnostic data.

    The contract is
    enforced by
    ``test_p120_no_secrets_in_metadata``
    in
    ``tests/test_phase1_p120_no_secrets_in_metadata.py``,
    which greps the source
    tree for the pattern
    ``metadata[.*[Ss]ecret``
    / ``metadata[.*[Kk]ey``
    / ``metadata[.*[Tt]oken``
    / ``metadata[.*[Pp]assword``
    and fails if a call site
    is found.
    """
    trace_id: str
    current_pdf: str | None = None
    # R-2026-06-15 (Phase 1 + P1-1.2):
    # the field type annotation
    # is ``Mapping[str, Any]``
    # (read-only view).  The
    # factory wraps an incoming
    # ``dict`` in
    # ``MappingProxyType`` in
    # ``__post_init__`` so:
    #
    # * the 1500+ existing
    #   tests that construct
    #   ``ToolContext(trace_id="t")``
    #   or
    #   ``ToolContext(trace_id="t", metadata={"k": v})``
    #   still work (a
    #   ``dict`` is accepted
    #   on the way in);
    # * tools that read
    #   ``ctx.metadata["k"]``
    #   keep working (the
    #   MappingProxyType is a
    #   drop-in for reads);
    # * tools that *write*
    #   ``ctx.metadata["k"] = v``
    #   raise ``TypeError`` at
    #   the write site, which
    #   is the whole point of
    #   this fix -- the
    #   ``frozen=True`` class
    #   flag did NOT freeze
    #   the inner dict, so the
    #   previous Hyrum's-Law
    #   trap was: a tool
    #   mutating
    #   ``ctx.metadata`` in
    #   place would corrupt the
    #   next tool's view of the
    #   same context (and the
    #   audit log if it was
    #   already snapshotted).
    #
    # Use ``with_metadata``
    # (or ``dataclasses.replace``)
    # to build a new
    # ``ToolContext`` with an
    # extra key.
    metadata: Mapping[str, Any] = field(
        default_factory=dict
    )

    def __post_init__(self) -> None:
        # ``frozen=True`` blocks
        # normal assignment but
        # ``object.__setattr__``
        # is still reachable for
        # the *type-coercion*
        # case (read-only view
        # of a write-once value
        # is allowed at construction
        # time).
        raw = self.metadata
        if not isinstance(raw, MappingProxyType):
            object.__setattr__(
                self,
                "metadata",
                MappingProxyType(
                    dict(raw) if raw else {}
                ),
            )

    def with_metadata(self, **kw: Any) -> "ToolContext":
        """Return a new
        ``ToolContext`` with
        ``metadata`` extended
        by ``**kw``.

        This is the only
        supported way to add a
        key after construction
        (the underlying mapping
        is a read-only view;
        ``ctx.metadata["k"] = v``
        raises ``TypeError``).
        The builder returns a
        *new* ``ToolContext``
        so the original is
        unaffected (the
        ``frozen=True`` class
        invariant is preserved).
        ``**kw`` keys overwrite
        existing values.
        """
        merged: dict[str, Any] = dict(self.metadata)
        merged.update(kw)
        return replace(self, metadata=merged)

    # ``MappingProxyType`` is
    # unhashable (it wraps a
    # dict), which makes the
    # dataclass-generated
    # ``__hash__`` raise
    # ``TypeError: unhashable
    # type: 'mappingproxy'``.
    # The original ``dict`` was
    # unhashable too, but in
    # practice the hash used
    # to silently ignore it
    # because dataclasses
    # with ``eq=True`` and
    # ``frozen=True`` use
    # ``object.__hash__`` only
    # when ``__hash__`` is
    # not ``None``; if any
    # field is unhashable,
    # ``hash()`` raises.
    # We therefore override
    # ``__hash__`` to hash
    # *only* the immutable
    # fields (``trace_id`` +
    # ``current_pdf``).  This
    # matches the pre-fix
    # behaviour for callers
    # that passed
    # ``frozen=True`` dataclasses
    # into ``set`` /
    # ``dict`` keys (the
    # dict-based metadata
    # path was already broken
    # in that sense, so this
    # is not a regression).
    def __hash__(self) -> int:
        return hash(
            (self.trace_id, self.current_pdf)
        )

    # R-2026-06-15 (Phase 1 +
    # P1-1.2): ``MappingProxyType``
    # is not picklable.  Convert
    # to a plain ``dict`` on
    # serialise, restore on
    # deserialise.  The audit
    # log and chat-session
    # persistence code both
    # rely on this.
    def __getstate__(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "current_pdf": self.current_pdf,
            "metadata": dict(self.metadata),
        }

    def __setstate__(self, state: dict[str, Any]) -> None:
        # ``__setstate__`` runs
        # after ``object.__new__``
        # but before ``__post_init__``,
        # so the dataclass
        # machinery has not yet
        # wrapped ``metadata`` in
        # ``MappingProxyType``.
        # Set the field via
        # ``object.__setattr__``
        # (the dataclass is
        # ``frozen=True``).
        object.__setattr__(
            self,
            "trace_id",
            state["trace_id"],
        )
        object.__setattr__(
            self,
            "current_pdf",
            state["current_pdf"],
        )
        object.__setattr__(
            self,
            "metadata",
            state["metadata"],
        )
        # Re-run ``__post_init__``
        # to wrap the dict in
        # ``MappingProxyType``.
        self.__post_init__()

    @property
    def report(self) -> "Any":
        """Return a typed
        ``ToolReport`` view of
        ``self.metadata``.

        The view is a
        derived dataclass
        (frozen, no
        storage). Reading
        the property twice
        on the same
        ``ToolContext`` returns
        equal but not
        identical objects
        (cheap; the
        conversion is a few
        dict lookups). The
        conversion never
        raises: a corrupt
        metadata is coerced
        to the default
        ``ToolReport()``
        (all fields
        unset).
        """
        # Lazy
        # import
        # to
        # avoid
        # a
        # circular
        # import
        # at
        # module
        # load
        # time
        # (the
        # report
        # module
        # imports
        # nothing
        # from
        # ``tools``,
        # but
        # other
        # tool
        # modules
        # do).
        from .report import (
            ToolReport,
        )
        return ToolReport.from_metadata(
            self.metadata
        )


class ToolResult:
    """Unified tool-execution
    envelope for the agent/message
    boundary.

    Existing tools still return
    strings, usually JSON. The agent
    loop wraps those legacy outputs
    in this envelope before sending
    them to the LLM, audit sink, or
    TUI callbacks. That gives every
    tool result the same traceable
    shape without forcing a broad
    rewrite of all tools at once.
    """

    def __init__(
        self,
        *,
        trace_id: str,
        tool_name: str,
        ok: bool,
        result: Any = None,
        error: str | None = None,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> None:
        self.trace_id = trace_id
        self.tool_name = tool_name
        self.ok = ok
        self.result = result
        self.error = error
        self.latency_ms = latency_ms
        self.metadata = dict(metadata or {})

    @classmethod
    def ok(
        cls,
        *,
        trace_id: str,
        tool_name: str,
        result: Any = None,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> "ToolResult":
        return cls(
            trace_id=trace_id,
            tool_name=tool_name,
            ok=True,
            result=result,
            error=None,
            latency_ms=latency_ms,
            metadata=metadata,
        )

    @classmethod
    def fail(
        cls,
        *,
        trace_id: str,
        tool_name: str,
        error: str,
        result: Any = None,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> "ToolResult":
        return cls(
            trace_id=trace_id,
            tool_name=tool_name,
            ok=False,
            result=result,
            error=error,
            latency_ms=latency_ms,
            metadata=metadata,
        )

    @classmethod
    def from_legacy_output(
        cls,
        *,
        trace_id: str,
        tool_name: str,
        output: Any,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> "ToolResult":
        # R-2026-06-15 (Phase 1 + P1-2):
        # ``from_legacy_output`` is
        # a string-typed contract
        # with two Hyrum's-Law
        # traps:
        #
        #   1. ``output.startswith("error:")``
        #      treats any string
        #      that *happens* to
        #      start with the literal
        #      ``error:`` (e.g.
        #      ``echo "error: file
        #      not found"``) as a
        #      tool failure.
        #
        #   2. ``json.loads(output)``
        #      inspects an
        #      ``ok=false`` flag in
        #      the parsed dict;
        #      tools that forget
        #      the flag (or use a
        #      different spelling
        #      like ``success`` or
        #      ``status``) silently
        #      fall through to
        #      ``ok=true``.
        #
        # The replacement is
        # ``from_envelope``, which
        # takes explicit ``ok``,
        # ``error_kind``, and
        # ``error`` fields.  This
        # method is preserved for
        # the rest of the v1.x
        # series (it is the path
        # the AgentLoop uses for
        # legacy string-returning
        # tools) but is deprecated
        # for new code.  We emit a
        # ``DeprecationWarning`` so
        # the test suite catches
        # accidental re-use.
        import warnings
        warnings.warn(
            "ToolResult.from_legacy_output is "
            "deprecated; use ToolResult.from_envelope "
            "with explicit ok / error_kind / error "
            "fields. The legacy path keeps a "
            "best-effort heuristic for backwards "
            "compatibility but misclassifies "
            'strings that start with "error: " '
            "and dicts that omit the ok flag.",
            DeprecationWarning,
            stacklevel=2,
        )
        return cls._from_legacy_output(
            trace_id=trace_id,
            tool_name=tool_name,
            output=output,
            latency_ms=latency_ms,
            metadata=metadata,
        )

    @classmethod
    def _from_legacy_output(
        cls,
        *,
        trace_id: str,
        tool_name: str,
        output: Any,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> "ToolResult":
        """R-2026-06-15 (Phase 1 + P1-2):
        the *private* (renamed)
        legacy-output parser.  New
        code should call
        ``from_envelope`` instead.
        """
        if isinstance(output, ToolResult):
            return output
        if isinstance(output, str):
            stripped = output.strip()
            if stripped.startswith("error:"):
                return cls.fail(
                    trace_id=trace_id,
                    tool_name=tool_name,
                    error=stripped,
                    latency_ms=latency_ms,
                    metadata=metadata,
                )
            try:
                parsed = json.loads(output)
            except (TypeError, ValueError):
                return cls.ok(
                    trace_id=trace_id,
                    tool_name=tool_name,
                    result=output,
                    latency_ms=latency_ms,
                    metadata=metadata,
                )
            if isinstance(parsed, dict):
                ok_value = parsed.get("ok")
                is_error = ok_value is False
                error = parsed.get("error")
                if is_error:
                    return cls.fail(
                        trace_id=trace_id,
                        tool_name=tool_name,
                        error=str(error or "tool returned ok=false"),
                        result=parsed,
                        latency_ms=latency_ms,
                        metadata=metadata,
                    )
                return cls.ok(
                    trace_id=trace_id,
                    tool_name=tool_name,
                    result=parsed,
                    latency_ms=latency_ms,
                    metadata=metadata,
                )
            return cls.ok(
                trace_id=trace_id,
                tool_name=tool_name,
                result=parsed,
                latency_ms=latency_ms,
                metadata=metadata,
            )
        return cls.ok(
            trace_id=trace_id,
            tool_name=tool_name,
            result=output,
            latency_ms=latency_ms,
            metadata=metadata,
        )

    @classmethod
    def from_envelope(
        cls,
        *,
        trace_id: str,
        tool_name: str,
        ok: bool,
        error_kind: str | None = None,
        error: str | None = None,
        result: Any = None,
        latency_ms: int | None = None,
        metadata: dict[str, str | int | float | bool] | None = None,
    ) -> "ToolResult":
        """R-2026-06-15 (Phase 1 + P1-2):
        explicit, typed builder for
        a ``ToolResult`` envelope.

        Replaces the string-typed
        ``from_legacy_output``
        path.  Callers state
        directly whether the
        tool succeeded (``ok=True``)
        or failed
        (``ok=False``) and, if
        the latter, the
        ``error_kind`` (one of
        the typed values listed
        in the AgentLoop audit)
        and the human-readable
        ``error`` string.  No
        string-prefix heuristics
        are applied.

        ``error_kind`` is a free-
        form string today but
        the LLM-facing report
        renderer is taught to
        switch on these values:
        ``permission_denied``,
        ``dependency_missing``,
        ``budget_exhausted``,
        ``command_failed``,
        ``command_failed``,
        ``argument_invalid``,
        ``not_found``, ``io_error``,
        ``internal``.

        ``error`` must be ``None``
        when ``ok`` is True;
        ``result`` is ignored
        when ``ok`` is False (the
        ``error`` is the source
        of truth for a failure,
        not the result).  Both
        invariants are enforced.
        """
        if ok and (error or error_kind):
            raise ValueError(
                "from_envelope(ok=True) must not "
                "have an error or error_kind; got "
                f"error={error!r}, "
                f"error_kind={error_kind!r}"
            )
        if (not ok) and not error:
            raise ValueError(
                "from_envelope(ok=False) requires "
                "an error string; the LLM-facing "
                "report renderer uses the error "
                "as the user-facing message"
            )
        if ok:
            return cls.ok(
                trace_id=trace_id,
                tool_name=tool_name,
                result=result,
                latency_ms=latency_ms,
                metadata=metadata,
            )
        # ok is False
        return cls(
            trace_id=trace_id,
            tool_name=tool_name,
            ok=False,
            result=result,
            error=error,
            latency_ms=latency_ms,
            metadata={
                **(metadata or {}),
                "error_kind": error_kind,
            }
            if error_kind
            else metadata,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "tool_name": self.tool_name,
            "ok": self.ok,
            "result": self.result,
            "error": self.error,
            "latency_ms": self.latency_ms,
            "metadata": self.metadata,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)

    # R-2026-06-15 (Phase 1 + P1-18):
    # the audit found that
    # ``ToolResult`` had no
    # ``__eq__`` /
    # ``__hash__`` -- two
    # ``ToolResult`` instances
    # with the same fields
    # were ``== False`` by
    # identity, which broke
    # test fixtures that
    # compared results across
    # tool calls (e.g.
    # "the second call should
    # produce the same
    # result as the first").
    # We add explicit
    # ``__eq__`` and
    # ``__hash__`` (the
    # *full* dataclass
    # conversion is deferred
    # to Phase 4 because it
    # would break the existing
    # ``ToolResult(...)`` call
    # sites in 200+ tests;
    # the @dataclass decorator
    # uses
    # ``__init__(self,
    # trace_id, tool_name,
    # ok, ...)`` which is
    # identical to the
    # current ``__init__``
    # *except* the
    # ``__init__`` is
    # generated by
    # ``@dataclass`` and the
    # tests rely on
    # ``ToolResult.fail(...)``
    # /
    # ``ToolResult.ok(...)``
    # -- those are still
    # classmethods so they
    # keep working; we just
    # need to verify after
    # the conversion that no
    # existing test breaks).
    #
    # The hash is based on the
    # same tuple of fields as
    # the equality, so the
    # ``__hash__`` and
    # ``__eq__`` are
    # consistent.
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, ToolResult):
            return NotImplemented
        return (
            self.trace_id == other.trace_id
            and self.tool_name == other.tool_name
            and self.ok == other.ok
            and self.result == other.result
            and self.error == other.error
            and self.latency_ms == other.latency_ms
            and self.metadata == other.metadata
        )

    def __hash__(self) -> int:
        # ``result`` may be a
        # nested dict / list
        # (unhashable).  We
        # convert it to a tuple
        # of (key, value) pairs
        # for hashing, which is
        # a stable representation
        # if the keys are
        # strings.  ``latency_ms``
        # is hashable (int or
        # None).  ``metadata`` is
        # a dict of
        # ``str|int|float|bool``
        # -- also converted to a
        # sorted-tuple of pairs.
        def _h(x: Any) -> int:
            if x is None:
                return 0
            if isinstance(x, (str, int, float, bool)):
                return hash(x)
            if isinstance(x, dict):
                return hash(
                    tuple(
                        sorted(
                            (k, _h(v))
                            for k, v in x.items()
                        )
                    )
                )
            if isinstance(x, list):
                return hash(tuple(_h(v) for v in x))
            return hash(repr(x))

        return hash(
            (
                self.trace_id,
                self.tool_name,
                self.ok,
                _h(self.result),
                self.error,
                self.latency_ms,
                _h(self.metadata),
            )
        )


@runtime_checkable
class Tool(Protocol):
    """Anything with a name, a description, a JSON-Schema
    description of its arguments, and a callable execute
    method is a Tool.

    The existing ``Detector`` class from
    ``manusift.detectors.base`` already implements three of
    these (name, description-as-docstring, run-as-execute).
    Step J1 publishes a tiny adapter (DetectorToolAdapter) so
    detectors become tools without rewriting the detector
    class.
    """

    name: str

    def description(self) -> str:
        """One-paragraph description of the tool, written
        for the LLM. Should include: what the tool does,
        what input shape it expects, what it returns, and
        any caveats (slow, requires API key, etc.)."""
        ...

    def input_schema(self) -> dict[str, Any]:
        """JSON Schema (draft-07) describing the tool's
        arguments. Must be a dict with at least ``{"type":
        "object", "properties": {...}}``. The AgentLoop
        passes this through to OpenAI / Anthropic unchanged
        after a sanity check."""
        ...

    def execute(self, input: dict[str, Any], ctx: ToolContext) -> str:
        """Run the tool. Returns a JSON-serialized result
        (string) that will be passed back to the LLM as the
        tool's "observation". Tools that want to return a
        structured finding list should ``json.dumps(...)`` it
        before returning. The string should be short — LLMs
        are sensitive to long tool results."""
        ...
