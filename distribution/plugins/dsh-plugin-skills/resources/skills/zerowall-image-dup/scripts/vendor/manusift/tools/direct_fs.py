"""Direct file-access tools (R-audit 2026-06-10).

Background: the previous ManuSift
architecture required the
user to manually run
``manusift ingest <path>``
or click ``/load <path>`` in
the TUI before the agent
could see a PDF. The user
reported this as a UX gap
versus Claude Code -- "I
gave you the file path, why
can't you just read it?".

This module adds two
tools that close that gap
without giving up the
security model:

  1. ``read_file(path)``
     -- read-only access
     to **text / markdown
     / CSV / JSON / source
     code** files at any
     path the user has
     read access to.
     Used for: notes,
     reference data,
     supplementary
     material the LLM
     needs for context
     (e.g. ``.xlsx``,
     ``.csv``, ``.md``).

  2. ``ingest_from_path(path)``
     -- auto-register a
     PDF at the given
     path. The LLM
     passes the path, the
     tool calls
     ``parse_pdf``,
     writes a new
     ``trace_id``, and
     returns the trace_id
     + summary. The LLM
     can then run the
     detectors on it. This
     is the equivalent of
     the user running
     ``manusift ingest``
     manually.

Security model:

  * ``read_file`` is
    **read-only** -- no
    writes, no exec.
  * ``ingest_from_path``
    **only accepts PDF
    files** (magic-number
    + extension check).
  * Both tools are
    gated by the
    ``MANUSIFT_ALLOW_DIRECT_FS``
    settings flag
    (``True`` by default
    -- admins can turn
    it off for sandboxed
    deployments).
  * Path resolution is
    absolute. Relative
    paths are rejected
    (defence in depth:
    no cwd-relative
    traversal).
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from .tool import Tool, ToolContext


# ---------- 1. read_file ----------


_MAX_READ_BYTES = 200_000  # 200 KB cap. PDFs are way bigger; this is
# a soft cap for *text* files (notes, csv, code).
_MAX_INLINE_LINES = 4_000  # ~200 KB at 50 chars/line


class ReadFileTool:
    """Claude-Code-style read-only file access.

    The LLM passes a
    ``path`` (absolute)
    and the tool returns
    the file's text
    content. The tool is
    read-only: no
    writes, no exec, no
    shell. PDFs are
    rejected with a
    helpful error -- use
    ``ingest_from_path``
    for PDFs.
    """

    name = "read_file"

    def description(self) -> str:
        return (
            "Read a text file (markdown, csv, json, source "
            "code, plain text) at an absolute path. Returns "
            "the file content as a string. Read-only -- no "
            "writes, no exec. Rejects PDFs (use "
            "`ingest_from_path` for PDFs) and any file larger "
            "than 200 KB. Path must be absolute."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Absolute path to the file to read. "
                        "Example: 'C:\\\\Users\\\\me\\\\notes.md'."
                    ),
                },
                "max_lines": {
                    "type": "integer",
                    "description": (
                        "Optional cap on the number of lines to "
                        "return. Default 1000."
                    ),
                },
            },
            "required": ["path"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        from ..config import get_settings

        settings = get_settings()
        if not getattr(settings, "allow_direct_fs", True):
            return json.dumps(
                {
                    "ok": False,
                    # R-2026-06-15 (Phase 1 + P1-7):
                    # typed ``error_kind`` so
                    # the agent loop and
                    # TUI renderer can
                    # switch on this without
                    # substring-matching the
                    # message.
                    "error_kind": "permission_denied",
                    "error": (
                        "direct filesystem access is disabled "
                        "(MANUSIFT_ALLOW_DIRECT_FS=False)"
                    ),
                }
            )
        # R-audit (2026-06-10):
        # the error
        # message is
        # deliberately
        # *explicit*
        # about the JSON
        # shape so the LLM
        # can not silently
        # ignore it. The
        # user reported a
        # session where the
        # LLM called
        # ``list_dir({})``
        # and then
        # hallucinated
        # "Good - there is
        # a PDF" because the
        # tool returned
        # ``"path is
        # required"``
        # (a one-liner
        # that the LLM was
        # free to skip). We
        # now echo the
        # required schema
        # keys + a worked
        # example so the
        # next retry is
        # obviously
        # correct.
        path_str = (input.get("path") or "").strip()
        if not path_str:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        "path is required but missing from your "
                        "JSON input. Re-call the tool with the "
                        'path as a JSON key, e.g. '
                        '{"path": "/path/to/paper.pdf"}. '
                        "The user gave a path in their message; "
                        "pass it through verbatim."
                    ),
                }
            )
        path = Path(path_str)
        # R-2026-06-17 (Phase A): 8 small
        # ``read_file`` hardening checks go
        # here, *before* the file is
        # touched. The order matters:
        # the cheapest
        # checks (path
        # string only)
        # run first, the
        # IO checks
        # (stat, read) go
        # last. This way
        # we never even
        # open a file we
        # know we cannot
        # serve.
        #
        # A-3: ``~`` /
        # ``~user``
        # expansion. Per
        # Hermes'
        # ``file_operations.py:810``,
        # validate the
        # username
        # against a safe
        # regex *before*
        # any shell
        # boundary so a
        # user-typed
        # ``~; rm -rf /``
        # never reaches
        # ``os.path.expanduser``.
        from .safe_read import (
            expand_user_path,
            is_blocked_device,
            has_binary_extension,
            is_proc_secret_path,
            is_protected_dir,
            is_extractable_document,
            try_extract_document,
            strip_utf8_bom,
            enforce_char_limit,
        )
        # R-2026-06-19 (P1-B2):
        # resolve the
        # ``block_protected_dir_reads``
        # setting once per
        # call so we can
        # honor env-var
        # overrides
        # (MANUSIFT_BLOCK_PROTECTED_DIR_READS=0
        # to opt out).  ``get_settings``
        # is memoised so
        # this is cheap
        # after the first
        # call.
        from ..config import get_settings
        _block_protected = (
            get_settings().block_protected_dir_reads
        )
        expanded_str = expand_user_path(path_str)
        if expanded_str != path_str:
            path_str = expanded_str
            path = Path(path_str)
        # R-2026-06-17 (Phase B):
        # B-2 —
        # check
        # the
        # per-task
        # mtime
        # dedup
        # tracker
        # *before*
        # any
        # IO.
        # If the
        # LLM
        # has
        # already
        # read
        # this
        # exact
        # (path,
        # offset,
        # limit)
        # in
        # this
        # task
        # and the
        # file
        # has
        # not
        # changed,
        # return
        # a
        # "file
        # unchanged"
        # stub
        # (1st
        # hit)
        # or
        # BLOCKED
        # (2nd+
        # hit).
        # The
        # tracker
        # is
        # stashed
        # in
        # ``ctx.metadata``
        # so it
        # survives
        # across
        # tool
        # calls
        # in
        # the
        # same
        # session
        # but
        # is
        # automatically
        # GC'd
        # when
        # the
        # session
        # ends.
        from .safe_read import get_tracker
        _max_lines_early = int(input.get("max_lines") or 1000)
        _max_lines_early = min(_max_lines_early, 4000)
        # R-2026-06-17 (Phase B):
        # ``ToolContext.metadata``
        # is
        # a
        # ``MappingProxyType``
        # (frozen)
        # so
        # we
        # cannot
        # stash
        # the
        # tracker
        # there.
        # Use
        # a
        # module-level
        # dict
        # keyed
        # by
        # ``ctx.trace_id``
        # (the
        # Hermes
        # pattern).
        _tracker = get_tracker(ctx.trace_id or "default")
        try:
            _current_mtime = (
                Path(path_str).stat().st_mtime
            ) if Path(path_str).exists() else None
        except OSError:
            _current_mtime = None
        _dedup = _tracker.check(
            path_str,
            1,
            _max_lines_early,
            current_mtime=_current_mtime,
        )
        if _dedup is not None:
            return json.dumps(_dedup, ensure_ascii=False)
        # A-1: blocked
        # device check
        # (pure path, 0
        # IO). Catches
        # ``/dev/zero``
        # /
        # ``/dev/stdin``
        # (Linux) and
        # ``CON`` /
        # ``NUL`` /
        # ``COM1``
        # (Windows)
        # *before* they
        # hang the
        # process.
        if is_blocked_device(path_str):
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"Cannot read {path_str!r}: this is a "
                        f"device file that would block or produce "
                        f"infinite output. Use a different tool "
                        f"for this kind of input."
                    ),
                    "path": path_str,
                }
            )
        # A-4: ``/proc/*/environ``
        # / ``cmdline``
        # / ``maps``
        # block.
        # Catches
        # accidental
        # host-process
        # secret leaks
        # (API keys in
        # env vars,
        # ``--api-key=``
        # CLI args, memory
        # layout).
        if is_proc_secret_path(path_str):
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"Cannot read {path_str!r}: this is a "
                        f"``/proc`` path that would expose the "
                        f"host process's environment variables, "
                        f"command-line arguments, or memory "
                        f"layout. Use a debugger with root "
                        f"privileges instead."
                    ),
                    "path": path_str,
                }
            )
        if not path.is_absolute():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"path must be absolute, got {path_str!r}. "
                        "Re-call the tool with a full Windows or "
                        "Unix path. Relative paths are rejected."
                    ),
                }
            )
        if not path.exists():
            # R-2026-06-17 (Phase B +
            # borrow
            # from
            # Hermes):
            # when
            # the
            # user-typed
            # path
            # doesn't
            # exist,
            # return
            # top
            # 5
            # fuzzy-matched
            # candidates
            # so the
            # LLM
            # doesn't
            # have
            # to
            # guess-and-retry.
            # The
            # candidates
            # are
            # absolute
            # paths
            # so the
            # LLM
            # can
            # re-call
            # ``read_file``
            # with
            # one
            # of
            # them
            # directly.
            from .safe_read import suggest_similar_files
            similar = suggest_similar_files(path_str)
            err: dict[str, object] = {
                "ok": False,
                "error_kind": "not_found",
                "error": f"file not found: {path_str}",
            }
            if similar:
                err["error"] = (
                    f"file not found: {path_str}. "
                    f"Did you mean one of these? {similar[:5]}"
                )
                err["similar_files"] = similar
            return json.dumps(err, ensure_ascii=False)
        if path.is_dir():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"path is a directory, not a file: "
                        f"{path_str}. Use a different tool to "
                        f"list directory contents."
                    ),
                }
            )
        # A-7: protected
        # dir hint. We
        # *allow* the
        # read (local
        # file), but
        # surface the
        # protected-dir
        # name so the
        # LLM does not
        # paraphrase
        # ``.git/config``
        # into the final
        # user report.
        _prot = is_protected_dir(path_str)
        # R-2026-06-19 (P1-B2):
        # when the user has
        # ``block_protected_dir_reads=True``
        # (the default),
        # refuse to read
        # paths inside any
        # of the protected
        # directories.
        # Borrowed from
        # Claude Code's
        # "always-deny for
        # config dirs"
        # policy. The user
        # can opt out by
        # setting
        # ``MANUSIFT_BLOCK_PROTECTED_DIR_READS=0``
        # in the env if they
        # really want to
        # read their
        # ``.git/config``.
        if _prot and _block_protected:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "permission_denied",
                    "error": (
                        f"refusing to read files inside "
                        f"protected directory "
                        f"'{_prot}'. Set "
                        f"MANUSIFT_BLOCK_PROTECTED_DIR_READS=0 "
                        f"to override."
                    ),
                    "protected_dir": _prot,
                    "path": path_str,
                },
                ensure_ascii=False,
            )
        if path.suffix.lower() == ".pdf":
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"PDFs cannot be read with `read_file`. "
                        f"Use `ingest_from_path('{path_str}')` "
                        f"to register this PDF with the "
                        f"integrity-screener."
                    ),
                }
            )
        # A-2: binary
        # extension
        # pre-block.
        # Catches
        # images /
        # archives /
        # exes *before*
        # the IO so the
        # user gets a
        # helpful
        # redirect
        # (vision_analyze
        # for images,
        # extract for
        # archives)
        # instead of a
        # 50 MB blob.
        _bin_ext = has_binary_extension(path_str)
        if _bin_ext is not None:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"Cannot read binary file {path_str!r} "
                        f"(extension {_bin_ext}). Use "
                        f"``vision_analyze`` for images, or "
                        f"extract the archive first."
                    ),
                    "path": path_str,
                    "extension": _bin_ext,
                }
            )
        # A-8: structured
        # document
        # extraction
        # fallback. Try
        # BEFORE the
        # binary guard
        # would
        # misclassify a
        # .docx as
        # binary. On
        # success we
        # return the
        # extracted text
        # (and the rest of
        # the read is
        # skipped). On
        # failure
        # (malformed file,
        # missing
        # ``read_extract``
        # module) we fall
        # through to the
        # normal
        # text-read branch
        # which surfaces a
        # cleaner
        # "not text"
        # error.
        if is_extractable_document(path_str):
            # R-2026-06-17 (Phase B):
            # use
            # the
            # *real*
            # extractors
            # (``python-docx``
            # /
            # ``openpyxl``
            # /
            # ``python-pptx``
            # /
            # ``nbformat``)
            # instead
            # of
            # the
            # Phase
            # A
            # stub
            # that
            # returned
            # ``None``
            # for
            # everything.
            # ``safe_read_b.try_extract_document_real``
            # raises
            # ``ExtractionError``
            # on
            # malformed
            # input;
            # ``on_error="fallback"``
            # turns
            # those
            # into
            # ``None``
            # so we
            # fall
            # through
            # to
            # the
            # normal
            # text-read
            # branch.
            from .safe_read import try_extract_document_real
            _extracted = try_extract_document_real(
                path_str,
                on_error="fallback",
            )
            if _extracted is not None:
                _lines = _extracted.splitlines()
                _max_lines = int(
                    input.get("max_lines") or 1000
                )
                _max_lines = min(
                    _max_lines, _MAX_INLINE_LINES
                )
                _truncated = (
                    len(_lines) > _max_lines
                )
                if _truncated:
                    _lines = _lines[:_max_lines]
                _content = "\n".join(_lines)
                # A-6: BOM
                # strip on
                # the first
                # chunk.
                _content = strip_utf8_bom(
                    _content,
                    is_first_chunk=True,
                )
                # A-5: char-limit
                # guard
                # (after
                # truncation
                # so the user
                # can paginate
                # with
                # max_lines).
                _limit_err = enforce_char_limit(
                    _content,
                    total_lines=len(_extracted.splitlines()),
                    path=path_str,
                )
                if _limit_err is not None:
                    return _limit_err
                return json.dumps(
                    {
                        "ok": True,
                        "path": str(path),
                        "size": path.stat().st_size,
                        "line_count": len(
                            _extracted.splitlines()
                        ),
                        "content": _content,
                        "truncated": _truncated,
                        "extracted_document": True,
                        # A-7:
                        # surface
                        # the
                        # protected
                        # dir
                        # hint
                        # in the
                        # response
                        # so the
                        # caller
                        # can
                        # see
                        # it.
                        "protected_dir": _prot,
                    },
                    ensure_ascii=False,
                )
            # else:
            # extraction
            # failed
            # (malformed
            # file or
            # missing
            # read_extract).
            # Fall
            # through to
            # the normal
            # text-read
            # branch.
        # Size cap.
        try:
            size = path.stat().st_size
        except OSError as exc:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "io_error",
                    "error": f"stat failed: {exc}",
                }
            )
        if size > _MAX_READ_BYTES:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"file is {size} bytes, exceeds "
                        f"{_MAX_READ_BYTES} cap. Use a "
                        f"more selective tool or read the file "
                        f"in chunks."
                    ),
                    "path": str(path),
                    "size": size,
                }
            )
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            # Try latin-1 as a fallback for legacy files.
            try:
                content = path.read_text(encoding="latin-1")
            except Exception as exc:  # noqa: BLE001
                return json.dumps(
                    {
                        "ok": False,
                        "error_kind": "io_error",
                        "error": (
                            f"could not decode file as utf-8 or "
                            f"latin-1: {exc}"
                        ),
                    }
                )
        # A-6: BOM strip
        # (only on the
        # first chunk --
        # see module
        # docstring for
        # why).
        content = strip_utf8_bom(
            content, is_first_chunk=True
        )
        max_lines = int(input.get("max_lines") or 1000)
        max_lines = min(max_lines, _MAX_INLINE_LINES)
        lines = content.splitlines()
        truncated = len(lines) > max_lines
        if truncated:
            lines = lines[:max_lines]
        content_str = "\n".join(lines)
        # A-5: char-limit
        # guard.
        _limit_err = enforce_char_limit(
            content_str,
            total_lines=len(content.splitlines()),
            path=path_str,
        )
        if _limit_err is not None:
            return _limit_err
        out = {
            "ok": True,
            "path": str(path),
            "size": size,
            "line_count": len(content.splitlines()),
            "content": content_str,
            "truncated": truncated,
            # A-7: protected
            # dir hint
            # surfaces in
            # the response
            # so the
            # caller (TUI /
            # agent loop)
            # can show "this
            # is a config
            # file, do not
            # paraphrase"
            # in the
            # ToolCallCard.
            "protected_dir": _prot,
        }
        # R-2026-06-17 (Phase B):
        # B-3 — redact
        # known
        # API-key
        # prefixes
        # *before*
        # the
        # content
        # enters
        # the
        # LLM
        # context.
        # The
        # model
        # can
        # still
        # see
        # the
        # surrounding
        # code
        # (e.g.
        # ``client = OpenAI(api_key=...)``)
        # but
        # the
        # key
        # itself
        # is
        # gone.
        from .safe_read import redact_sensitive_text

        out["content"] = redact_sensitive_text(
            out["content"]
        )
        # R-2026-06-17 (Phase B):
        # B-2 —
        # record
        # the
        # successful
        # read
        # so
        # the
        # next
        # call
        # for
        # the
        # same
        # (path,
        # offset,
        # limit)
        # can
        # return
        # a
        # "file
        # unchanged"
        # stub
        # instead
        # of
        # re-sending
        # the
        # same
        # content.
        from .safe_read import get_tracker
        _tracker = get_tracker(ctx.trace_id or "default")
        try:
            _mtime = path.stat().st_mtime
        except OSError:
            _mtime = 0.0
        _tracker.record(
            str(path), 1, max_lines, _mtime
        )
        return json.dumps(out, ensure_ascii=False)


# ---------- 2. ingest_from_path ----------


class IngestFromPathTool:
    """Register a PDF at the given path with the
    integrity-screener.

    The LLM passes a
    ``path`` (absolute)
    to a PDF. The tool
    parses the PDF,
    writes the extracted
    artefacts to the
    workspace, and
    returns a new
    ``trace_id`` that
    the LLM can then
    pass to the
    detector tools (e.g.
    ``image_dup``,
    ``image_forensics``,
    ``stat_pvalue``).

    This is the
    equivalent of the
    user running
    ``manusift ingest
    <path>`` manually,
    but driven by the
    LLM.
    """

    name = "ingest_from_path"

    def description(self) -> str:
        return (
            "Register a PDF at the given absolute path with "
            "the integrity-screener. Parses the PDF (text, "
            "images, metadata, and companion data files such "
            "as XLSX / CSV / TSV / JSON in the same directory "
            "or in explicit `data_paths`), "
            "writes extracted artefacts to the workspace, "
            "and returns a fresh "
            "`trace_id` that the caller can then use to "
            "run detectors (image_dup, image_forensics, "
            "table_benford, table_duplicate_row, stat_pvalue, "
            "ref_duplicate, etc.). Equivalent "
            "to running `manusift ingest <path>` manually, "
            "but driven by the LLM. Only PDFs are accepted; "
            "use `read_file` for other file types."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Absolute path to the PDF to ingest. "
                        "Must end in .pdf and have the %PDF- "
                        "magic number at the start."
                    ),
                },
                "data_paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Optional absolute paths to companion "
                        "source-data files or directories "
                        "(XLSX, CSV, TSV, JSON) that live outside "
                        "the PDF directory. These are copied into "
                        "the job materials folder before parsing "
                        "so table detectors can analyze them."
                    ),
                    "default": [],
                },
            },
            "required": ["path"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        from ..config import get_settings

        settings = get_settings()
        if not getattr(settings, "allow_direct_fs", True):
            return json.dumps(
                {
                    "ok": False,
                    # R-2026-06-15 (Phase 1 + P1-7):
                    # typed ``error_kind`` so
                    # the agent loop and
                    # TUI renderer can
                    # switch on this without
                    # substring-matching the
                    # message.
                    "error_kind": "permission_denied",
                    "error": (
                        "direct filesystem access is disabled "
                        "(MANUSIFT_ALLOW_DIRECT_FS=False)"
                    ),
                }
            )
        # R-audit (2026-06-10):
        # the error
        # message is
        # deliberately
        # *explicit*
        # about the JSON
        # shape so the LLM
        # can not silently
        # ignore it. The
        # user reported a
        # session where the
        # LLM called
        # ``list_dir({})``
        # and then
        # hallucinated
        # "Good - there is
        # a PDF" because the
        # tool returned
        # ``"path is
        # required"``
        # (a one-liner
        # that the LLM was
        # free to skip). We
        # now echo the
        # required schema
        # keys + a worked
        # example so the
        # next retry is
        # obviously
        # correct.
        path_str = (input.get("path") or "").strip()
        if not path_str:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        "path is required but missing from your "
                        "JSON input. Re-call the tool with the "
                        'path as a JSON key, e.g. '
                        '{"path": "/path/to/paper.pdf"}. '
                        "The user gave a path in their message; "
                        "pass it through verbatim."
                    ),
                }
            )
        path = Path(path_str)
        if not path.is_absolute():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"path must be absolute, got {path_str!r}. "
                        "Re-call the tool with a full Windows or "
                        "Unix path. Relative paths are rejected."
                    ),
                }
            )
        if not path.exists():
            # R-2026-06-17 (Phase B +
            # borrow
            # from
            # Hermes):
            # when
            # the
            # user-typed
            # path
            # doesn't
            # exist,
            # return
            # top
            # 5
            # fuzzy-matched
            # candidates
            # so the
            # LLM
            # doesn't
            # have
            # to
            # guess-and-retry.
            # The
            # candidates
            # are
            # absolute
            # paths
            # so the
            # LLM
            # can
            # re-call
            # ``read_file``
            # with
            # one
            # of
            # them
            # directly.
            from .safe_read import suggest_similar_files
            similar = suggest_similar_files(path_str)
            err: dict[str, object] = {
                "ok": False,
                "error_kind": "not_found",
                "error": f"file not found: {path_str}",
            }
            if similar:
                err["error"] = (
                    f"file not found: {path_str}. "
                    f"Did you mean one of these? {similar[:5]}"
                )
                err["similar_files"] = similar
            return json.dumps(err, ensure_ascii=False)
        if path.suffix.lower() != ".pdf":
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"path does not end in .pdf: {path_str}. "
                        f"Use `read_file` for non-PDF files."
                    ),
                }
            )
        # Magic-number check.
        try:
            with path.open("rb") as f:
                head = f.read(8)
        except OSError as exc:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "io_error",
                    "error": f"read failed: {exc}",
                }
            )
        if not head.startswith(b"%PDF-"):
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"file is not a valid PDF (missing "
                        f"%PDF- magic number): {path_str}"
                    ),
                }
            )
        # Call the pipeline parser.
        from ..ingest.pdf import parse_pdf
        from ..trace import new_trace_id

        new_tid = new_trace_id()
        workspace_dir = settings.workspace_dir
        copied_data_paths: list[str] = []
        # R-2026-06-17 (Phase 4 +
        # auto-discover
        # source data):
        # the
        # subset
        # of
        # ``copied_data_paths``
        # that
        # came
        # from
        # the
        # auto-discovery
        # pass
        # (rather
        # than
        # the
        # user's
        # explicit
        # ``data_paths``).
        # Surfaced
        # separately
        # in
        # the
        # response
        # so the
        # LLM can
        # say
        # "auto-discovered
        # N files
        # in <dir>"
        # with
        # the
        # actual
        # count
        # (criterion
        # #7).
        auto_copied_paths: list[str] = []
        ignored_data_paths: list[dict[str, str]] = []
        # R-audit (2026-06-11):
        # copy
        # the
        # original
        # PDF
        # to
        # ``<workspace_dir>/<trace_id>/inputs/original.pdf``
        # so
        # the
        # detector
        # ``DetectorToolAdapter``
        # can
        # find
        # it
        # via
        # ``JobPaths.for_trace(trace_id).original.exists()``.
        # Without
        # this
        # copy
        # the
        # adapter
        # always
        # returns
        # "PDF
        # not
        # found
        # for
        # trace_id=..."
        # even
        # though
        # ``parse_pdf``
        # already
        # ran
        # successfully
        # and
        # wrote
        # the
        # extracted
        # images.
        try:
            from ..workspace import JobPaths
            from shutil import copy2 as _copy2
            _paths = JobPaths.for_trace(new_tid, workspace_dir)
            _paths.ensure()
            _copy2(path, _paths.original)
            materials_dir = _paths.materials_dir
            materials_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "io_error",
                    "error": f"prepare workspace failed: {exc}",
                    "trace_id": new_tid,
                },
                ensure_ascii=False,
            )

        data_paths = input.get("data_paths") or []
        if isinstance(data_paths, str):
            data_paths = [data_paths]
        from ..ingest.xlsx import discover_companion_files
        # R-2026-06-17 (Phase 4 +
        # auto-discover
        # source data):
        # the user
        # complaint
        # was that
        # the LLM
        # had to
        # *manually*
        # pass
        # ``data_paths=[/parent/dir]``
        # in a
        # second
        # call.
        # When the
        # user gives
        # a PDF
        # path, we
        # now also
        # auto-discover
        # companion
        # files in
        # the PDF's
        # parent dir
        # and a
        # small
        # set of
        # conventional
        # sub-dirs
        # (``source_data``
        # / ``materials``
        # / ``supplementary``
        # / ``supplementary_data``)
        # so the
        # user
        # does NOT
        # have to
        # know the
        # convention.
        # We track
        # the
        # auto-discovered
        # set so
        # the
        # response
        # can
        # surface
        # "found N
        # companion
        # files in
        # <dir>" to
        # the user.
        auto_discovered_dirs: list[dict[str, Any]] = []
        if path.is_file() and path.suffix.lower() == ".pdf":
            # Only
            # auto-discover
            # when the
            # user
            # gave us
            # a PDF
            # (not a
            # directory
            # -- directory
            # input
            # already
            # goes
            # through
            # ``discover_companion_files``
            # in the
            # loop
            # below).
            pdf_dir = path.parent
            # Conventional
            # sub-dir
            # names
            # (case
            # sensitive
            # on POSIX,
            # case
            # insensitive
            # on
            # Windows
            # -- we
            # try the
            # literal
            # name
            # first
            # and a
            # lowercased
            # version
            # for
            # Windows
            # callers).
            SUB_DIRS = (
                "",  # the
                    # PDF's
                    # own
                    # dir
                "source_data",
                "materials",
                "supplementary",
                "supplementary_data",
                "Source_Data",
                "Supplementary",
                "Materials",
            )
            # R-2026-06-17 (Phase 4 +
            # auto-discover
            # source data):
            # Windows
            # is
            # case-insensitive
            # so
            # ``source_data``
            # and
            # ``Source_Data``
            # resolve
            # to
            # the
            # same
            # dir.
            # Without
            # this
            # dedup
            # the
            # same
            # files
            # are
            # auto-discovered
            # multiple
            # times
            # (the
            # user
            # gets
            # ``Table_S1.xlsx``,
            # ``Table_S1_2.xlsx``,
            # ``Table_S1_3.xlsx``
            # in
            # the
            # materials
            # dir
            # --
            # all
            # copies
            # of
            # the
            # same
            # file).
            # We
            # resolve
            # each
            # candidate
            # directory
            # once
            # and
            # only
            # auto-discover
            # from
            # the
            # first
            # case-spelling
            # that
            # hits
            # the
            # same
            # resolved
            # path.
            seen_resolved_dirs: set[str] = set()
            # R-2026-06-17 (Phase 4 +
            # auto-discover
            # source data,
            # file dedup):
            # ``iter_data_files_in``
            # recurses
            # with
            # ``max_depth=3``,
            # so
            # scanning
            # the
            # parent
            # dir
            # picks
            # up
            # the
            # files
            # in
            # ``Source_Data/``,
            # ``supplementary/``,
            # ``materials/``
            # too.
            # Then
            # scanning
            # each
            # of
            # those
            # sub-dirs
            # picks
            # up
            # the
            # same
            # files
            # *again*
            # (the
            # same
            # ``Table_S1.xlsx``
            # is
            # found
            # 3
            # times
            # --
            # once
            # via
            # parent
            # scan,
            # once
            # via
            # ``Source_Data``
            # scan,
            # etc.).
            # Without
            # this
            # set
            # the
            # user
            # gets
            # ``Table_S1.xlsx``,
            # ``Table_S1_2.xlsx``,
            # ``Table_S1_3.xlsx``
            # in
            # the
            # materials
            # dir
            # (3
            # copies
            # of
            # the
            # same
            # file).
            # We
            # track
            # the
            # resolved
            # path
            # of
            # every
            # file
            # we
            # have
            # *already*
            # queued
            # for
            # ingest
            # and
            # skip
            # any
            # later
            # occurrence
            # at
            # the
            # *file*
            # level
            # (not
            # just
            # the
            # dir
            # level).
            seen_resolved_files: set[str] = set()
            for sub in SUB_DIRS:
                candidate_dir = (
                    pdf_dir / sub if sub else pdf_dir
                )
                if not candidate_dir.is_dir():
                    continue
                # Resolve
                # once
                # so
                # case
                # differences
                # collapse
                # to
                # the
                # same
                # key
                # on
                # Windows.
                try:
                    resolved = (
                        candidate_dir.resolve()
                    )
                except OSError:
                    resolved = candidate_dir
                key = str(resolved).lower()
                if key in seen_resolved_dirs:
                    continue
                seen_resolved_dirs.add(key)
                # Don't
                # re-scan
                # the
                # directory
                # if the
                # user
                # already
                # gave it
                # in
                # ``data_paths``.
                if str(candidate_dir) in data_paths:
                    continue
                try:
                    files_here = list(
                        discover_companion_files(
                            candidate_dir,
                            extract_archives_to=(
                                materials_dir / "_archives"
                            ),
                        )
                    )
                except Exception as exc:  # noqa: BLE001
                    ignored_data_paths.append(
                        {
                            "path": str(candidate_dir),
                            "reason": (
                                f"auto-discover failed: "
                                f"{exc}"
                            ),
                        }
                    )
                    continue
                if not files_here:
                    continue
                # Filter
                # out
                # the
                # main
                # PDF
                # itself
                # (we
                # don't
                # want
                # to
                # register
                # the
                # paper
                # as
                # its
                # own
                # data
                # source).
                files_here = [
                    f
                    for f in files_here
                    if f.resolve()
                    != path.resolve()
                ]
                if not files_here:
                    continue
                # Per-file
                # dedup
                # --
                # skip
                # files
                # already
                # queued
                # by
                # an
                # earlier
                # ``sub``
                # iteration.
                new_files: list[Path] = []
                for f in files_here:
                    try:
                        fkey = str(f.resolve()).lower()
                    except OSError:
                        fkey = str(f).lower()
                    if fkey in seen_resolved_files:
                        continue
                    seen_resolved_files.add(fkey)
                    new_files.append(f)
                if not new_files:
                    continue
                # Inject
                # each
                # file
                # into
                # ``data_paths``
                # so
                # the
                # existing
                # loop
                # (below)
                # handles
                # copy
                # +
                # parse
                # uniformly.
                # Use a
                # sentinel
                # so we
                # can
                # later
                # surface
                # "auto-discovered"
                # vs
                # "user-explicit".
                for f in new_files:
                    # We
                    # push
                    # the
                    # *file
                    # path*
                    # (not
                    # the
                    # dir)
                    # so
                    # the
                    # per-file
                    # copy
                    # path
                    # is
                    # unique
                    # and
                    # the
                    # file
                    # itself
                    # is
                    # re-checked
                    # against
                    # the
                    # allowlist
                    # (the
                    # discover
                    # step
                    # already
                    # filtered
                    # by
                    # extension
                    # but
                    # we
                    # double-check
                    # below).
                    data_paths.append(
                        "__auto__:"
                        + str(f)
                    )
                auto_discovered_dirs.append(
                    {
                        "dir": str(candidate_dir),
                        "found": [
                            f.name for f in new_files
                        ],
                    }
                )
        # R-2026-06-16 (Phase 4 +
        # SI-PDF fix): the
        # ``data_paths``
        # allowlist used
        # to be only
        # tabular / zip
        # (XLSX, CSV,
        # TSV, JSON,
        # ZIP). SI PDFs
        # (``MOESM1.pdf``,
        # ``MOESM2.pdf``
        # etc.) were
        # silently
        # rejected as
        # ``"unsupported
        # extension"``
        # and never made
        # it into the
        # detector run,
        # so image and
        # text findings
        # in the SI were
        # invisible. We
        # now also
        # accept ``.pdf``
        # as a
        # ``data_path``.
        # The handling
        # below merges
        # the SI PDF
        # into the main
        # ``ParsedDoc``
        # (images,
        # text blocks,
        # tables) so
        # every
        # detector sees
        # the SI content
        # without
        # needing a
        # second
        # ``ingest_from_path``
        # call.
        supported = {
            ".xlsx",
            ".csv",
            ".tsv",
            ".json",
            ".zip",
            ".pdf",
        }

        def _unique_target(src: Path) -> Path:
            target = materials_dir / src.name
            if not target.exists():
                return target
            stem = src.stem
            suffix = src.suffix
            idx = 2
            while True:
                candidate = materials_dir / f"{stem}_{idx}{suffix}"
                if not candidate.exists():
                    return candidate
                idx += 1

        for raw_data_path in data_paths:
            if not isinstance(raw_data_path, str):
                ignored_data_paths.append(
                    {
                        "path": repr(raw_data_path),
                        "reason": "not a string",
                    }
                )
                continue
            # R-2026-06-17 (Phase 4 +
            # auto-discover
            # source data):
            # ``__auto__:``
            # is the
            # sentinel
            # we
            # use to
            # mark
            # a
            # file
            # path
            # that
            # came
            # from
            # the
            # auto-discovery
            # pass
            # (above)
            # rather
            # than
            # from
            # the
            # user's
            # explicit
            # ``data_paths``.
            # Strip
            # the
            # prefix
            # here
            # so the
            # rest of
            # the
            # loop
            # treats
            # it
            # like
            # any
            # other
            # file.
            is_auto = False
            if raw_data_path.startswith("__auto__:"):
                is_auto = True
                raw_data_path = raw_data_path[
                    len("__auto__:") :
                ]
            data_path = Path(raw_data_path)
            if not data_path.is_absolute():
                ignored_data_paths.append(
                    {
                        "path": raw_data_path,
                        "reason": "not absolute",
                    }
                )
                continue
            if not data_path.exists():
                ignored_data_paths.append(
                    {
                        "path": raw_data_path,
                        "reason": "not found",
                    }
                )
                continue
            try:
                candidates = (
                    discover_companion_files(
                        data_path,
                        extract_archives_to=materials_dir / "_archives",
                    )
                    if data_path.is_dir()
                    else [data_path]
                )
            except Exception as exc:  # noqa: BLE001
                ignored_data_paths.append(
                    {
                        "path": raw_data_path,
                        "reason": f"discover failed: {exc}",
                    }
                )
                continue
            for candidate in candidates:
                if candidate.suffix.lower() not in supported:
                    ignored_data_paths.append(
                        {
                            "path": str(candidate),
                            "reason": "unsupported extension",
                        }
                    )
                    continue
                # R-2026-06-17 (Phase 4 +
                # auto-discover
                # source data):
                # skip the
                # main PDF
                # itself
                # (defence
                # in depth
                # -- the
                # PDF
                # was
                # already
                # excluded
                # in the
                # discovery
                # pass,
                # but if
                # the
                # user
                # explicitly
                # passed
                # the
                # same
                # PDF in
                # ``data_paths``,
                # we
                # still
                # do not
                # want to
                # register
                # it as a
                # data
                # source).
                if path.is_file() and candidate.resolve() == path.resolve():
                    continue
                target = _unique_target(candidate)
                try:
                    shutil.copy2(candidate, target)
                except Exception as exc:  # noqa: BLE001
                    ignored_data_paths.append(
                        {
                            "path": str(candidate),
                            "reason": f"copy failed: {exc}",
                        }
                    )
                    continue
                copied_data_paths.append(str(target))
                # Track
                # which
                # copies
                # came
                # from
                # auto-discovery
                # so the
                # response
                # can
                # surface
                # them
                # separately.
                if is_auto:
                    auto_copied_paths.append(str(target))
        try:
            doc = parse_pdf(
                path,
                trace_id=new_tid,
                workspace_dir=workspace_dir,
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "internal",
                    "error": f"parse_pdf failed: {exc}",
                    "trace_id": new_tid,
                }
            )
        # R-audit (2026-06-14):
        # ``parse_pdf`` only
        # returns PDF-native
        # tables. The user
        # who copies an
        # XLSX/CSV/TSV/JSON
        # companion file
        # into the job
        # materials folder
        # expects the table
        # detectors to see
        # the new tables --
        # they would
        # otherwise silently
        # miss them (the
        # detector loop reads
        # ``doc.tables``). We
        # re-parse every
        # copied data file
        # here and append
        # the resulting
        # ``ExtractedTable``s
        # onto ``doc``. We
        # also enforce the
        # ``data_source_max_files``
        # cap so a directory
        # full of CSVs
        # cannot blow up the
        # context window.
        extra_tables: list = []
        # R-2026-06-16 (Phase 4 +
        # SI-PDF fix): we now
        # also accumulate
        # images and text
        # blocks from SI
        # PDFs, not just
        # tables from
        # XLSX/CSV.
        extra_images: list = []
        extra_text_blocks: list = []
        from ..ingest.xlsx import parse_data_file
        _ds_max = int(
            getattr(
                settings,
                "data_source_max_files",
                100,
            )
        )
        _ds_count = 0
        for data_path_str in copied_data_paths:
            if (
                _ds_max
                and _ds_count >= _ds_max
            ):
                ignored_data_paths.append(
                    {
                        "path": data_path_str,
                        "reason": (
                            f"data_source_max_files "
                            f"cap {_ds_max} reached"
                        ),
                    }
                )
                continue
            _path_obj = Path(data_path_str)
            try:
                # R-2026-06-16
                # (Phase 4 + SI-PDF):
                # SI PDFs are
                # *separate*
                # documents.
                # ``parse_data_file``
                # handles tabular
                # files (XLSX /
                # CSV / TSV /
                # JSON). For
                # ``.pdf`` we
                # use
                # ``parse_pdf``
                # directly and
                # merge the
                # resulting
                # ``text_blocks``,
                # ``images``,
                # and ``tables``
                # into the
                # main
                # ``ParsedDoc``.
                # The SI gets
                # its own
                # ``trace_id``
                # suffix
                # (``_si0``,
                # ``_si1`` ...)
                # so its
                # extracted
                # images do
                # not collide
                # with the
                # main PDF's
                # images on
                # disk.
                if (
                    _path_obj.suffix.lower()
                    == ".pdf"
                ):
                    si_trace_id = (
                        f"{new_tid}_si{_ds_count}"
                    )
                    si_doc = parse_pdf(
                        _path_obj,
                        trace_id=si_trace_id,
                        workspace_dir=(
                            workspace_dir
                        ),
                    )
                    extra_images.extend(
                        si_doc.images or []
                    )
                    # Offset SI
                    # text-block
                    # pages by
                    # the main
                    # doc's page
                    # count so
                    # downstream
                    # page
                    # references
                    # remain
                    # unique.
                    main_pages = (
                        doc.page_count
                    )
                    for tb in (
                        si_doc.text_blocks or []
                    ):
                        try:
                            from dataclasses import (
                                replace as _tb_replace,
                            )
                            extra_text_blocks.append(
                                _tb_replace(
                                    tb,
                                    page=(
                                        tb.page
                                        + main_pages
                                    ),
                                )
                            )
                        except Exception:
                            extra_text_blocks.append(
                                tb
                            )
                    extra_tables.extend(
                        si_doc.tables or []
                    )
                    _ds_count += 1
                    continue
                _tbls = parse_data_file(
                    data_path_str
                )
            except Exception as exc:  # noqa: BLE001
                ignored_data_paths.append(
                    {
                        "path": data_path_str,
                        "reason": (
                            f"parse_data_file failed: {exc}"
                        ),
                    }
                )
                continue
            # R-2026-06-17 (Phase 4 +
            # auto-discover
            # source data,
            # dedup):
            # ``parse_pdf``
            # already
            # scans
            # ``<trace>/inputs/materials/``
            # and
            # parses
            # the
            # companion
            # XLSX /
            # CSV /
            # TSV /
            # JSON
            # files
            # itself
            # (see
            # ``manusift.ingest.pdf.parse_pdf``
            # step
            # 2,
            # ``parse_companion_files``).
            # The
            # second
            # loop
            # here
            # would
            # re-parse
            # the
            # *same*
            # files
            # and
            # produce
            # *duplicate*
            # tables
            # in
            # ``doc.tables``
            # (so
            # ``data_source_count``
            # over-reports
            # vs.
            # what
            # ``list_data_sources``
            # returns).
            # We
            # dedupe
            # by
            # ``source_path``
            # (the
            # resolved
            # path
            # of
            # the
            # underlying
            # file):
            # if
            # ``doc.tables``
            # already
            # has
            # a
            # table
            # whose
            # ``source_path``
            # matches
            # ``data_path_str``,
            # skip
            # the
            # new
            # tables.
            try:
                _seen_paths = {
                    str(
                        Path(
                            t.source_path
                        ).resolve()
                    ).lower()
                    for t in (
                        doc.tables or []
                    )
                }
                _new_tbls = []
                for _t in _tbls:
                    try:
                        _k = str(
                            Path(
                                _t.source_path
                            ).resolve()
                        ).lower()
                    except OSError:
                        _k = (
                            _t.source_path
                            or ""
                        ).lower()
                    if _k in _seen_paths:
                        continue
                    _seen_paths.add(_k)
                    _new_tbls.append(_t)
                _tbls = _new_tbls
            except Exception:  # noqa: BLE001
                # If
                # dedup
                # fails
                # for
                # any
                # reason,
                # keep
                # the
                # original
                # tables
                # (the
                # worst
                # case
                # is
                # a
                # small
                # over-count
                # which
                # is
                # less
                # bad
                # than
                # crashing
                # the
                # ingest).
                pass
            extra_tables.extend(_tbls)
            _ds_count += 1
        if (
            extra_tables
            or extra_images
            or extra_text_blocks
        ):
            try:
                from dataclasses import (
                    replace as _dc_replace
                )
                # ``ParsedDoc`` is
                # frozen; we use
                # ``dataclasses.replace``
                # to build a new
                # instance with the
                # extended table
                # list, image
                # list, and text
                # block list.
                # R-2026-06-16
                # (Phase 4 + SI-PDF):
                # we now also
                # merge
                # ``extra_images``
                # (SI raster
                # images) and
                # ``extra_text_blocks``
                # (SI text) so
                # image and text
                # detectors see
                # the SI content.
                doc = _dc_replace(
                    doc,
                    tables=(
                        list(
                            getattr(
                                doc, "tables", []
                            ) or []
                        )
                        + extra_tables
                    ),
                    images=(
                        list(
                            getattr(
                                doc, "images", []
                            ) or []
                        )
                        + extra_images
                    ),
                    text_blocks=(
                        list(
                            getattr(
                                doc,
                                "text_blocks",
                                [],
                            )
                            or []
                        )
                        + extra_text_blocks
                    ),
                )
            except Exception as exc:  # noqa: BLE001
                # ``ParsedDoc`` is
                # frozen and may
                # have a missing
                # ``tables`` field
                # in legacy
                # versions. As a
                # last-resort, we
                # log a warning
                # but keep going
                # with the empty
                # extension.
                import logging
                logging.getLogger(__name__).warning(
                    "could not extend doc.tables with "
                    "ingested companion files",
                    extra={"err": str(exc)},
                )
        # Compose a small summary so the LLM has the
        # minimum context to decide which detectors to run.
        n_images = len(doc.images)
        tables = list(getattr(doc, "tables", []) or [])
        n_tables = len(tables)
        data_sources = []
        for table in tables[:12]:
            data_sources.append(
                {
                    "table_id": getattr(table, "table_id", ""),
                    "source_kind": getattr(table, "source_kind", ""),
                    "source_path": getattr(table, "source_path", ""),
                    "sheet_name": getattr(table, "sheet_name", ""),
                    "row_count": len(getattr(table, "rows", []) or []),
                    "column_count": len(getattr(table, "headers", []) or []),
                }
            )
        # ``ParsedDoc.text_blocks`` is a list of
        # ``TextBlock`` -- count it.
        n_blocks = len(getattr(doc, "text_blocks", []))
        meta = getattr(doc, "metadata", {}) or {}
        page_count = (
            meta.get("page_count")
            or getattr(doc, "page_count", None)
        )
        return json.dumps(
            {
                "ok": True,
                "trace_id": new_tid,
                "path": str(path),
                "filename": path.name,
                "image_count": n_images,
                "table_count": n_tables,
                "data_source_count": n_tables,
                "data_sources": data_sources,
                "copied_data_paths": copied_data_paths,
                # R-2026-06-17 (Phase 4 +
                # auto-discover
                # source data):
                # the
                # companion
                # files
                # we
                # auto-discovered
                # in
                # the
                # PDF's
                # parent
                # / sub-dirs.
                # ``auto_discovered``
                # is a
                # list
                # of
                # ``{dir,
                # found}``
                # records
                # so the
                # LLM
                # can
                # surface
                # the
                # source
                # directory
                # in its
                # reply.
                # ``auto_discovered_count``
                # is a
                # flat
                # integer
                # for
                # easy
                # assertion
                # /
                # user
                # reply.
                "auto_discovered": auto_discovered_dirs,
                "auto_discovered_count": (
                    sum(
                        len(d["found"])
                        for d in auto_discovered_dirs
                    )
                ),
                "auto_copied_paths": auto_copied_paths,
                "ignored_data_paths": ignored_data_paths,
                "text_block_count": n_blocks,
                "page_count": page_count,
                "next_step": (
                    f"Use `trace_id={new_tid!r}` with any "
                    f"detector tool (e.g. image_dup, "
                    f"image_forensics, table_benford, "
                    f"table_duplicate_row, stat_pvalue, "
                    f"ref_duplicate, pdf_metadata) to "
                    f"screen the paper. If data_sources is "
                    f"non-empty, run table/data-source tools too."
                ),
            },
            ensure_ascii=False,
        )


# ---------- 3. list_dir ----------


class ListDirTool:
    """List the contents of a directory (Claude-Code-style).

    Useful for
    discovering
    companion files
    (.xlsx, .csv,
    .md) that the
    user might have
    alongside the
    PDF.
    """

    name = "list_dir"

    def description(self) -> str:
        return (
            "List the contents of a directory at the given "
            "absolute path. Returns a JSON list of "
            "{name, type, size} entries. Hidden files "
            "(starting with '.') are skipped. Use this to "
            "discover companion files (e.g. supplementary "
            "data, code) alongside a PDF."
        )

    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Absolute path to the directory to list."
                    ),
                },
                "max_entries": {
                    "type": "integer",
                    "description": (
                        "Optional cap on the number of entries. "
                        "Default 200."
                    ),
                },
            },
            "required": ["path"],
        }

    def execute(
        self,
        input: dict[str, Any],
        ctx: ToolContext,
    ) -> str:
        from ..config import get_settings

        settings = get_settings()
        if not getattr(settings, "allow_direct_fs", True):
            return json.dumps(
                {
                    "ok": False,
                    # R-2026-06-15 (Phase 1 + P1-7):
                    # typed ``error_kind`` so
                    # the agent loop and
                    # TUI renderer can
                    # switch on this without
                    # substring-matching the
                    # message.
                    "error_kind": "permission_denied",
                    "error": (
                        "direct filesystem access is disabled "
                        "(MANUSIFT_ALLOW_DIRECT_FS=False)"
                    ),
                }
            )
        # R-audit (2026-06-10):
        # the error
        # message is
        # deliberately
        # *explicit*
        # about the JSON
        # shape so the LLM
        # can not silently
        # ignore it. The
        # user reported a
        # session where the
        # LLM called
        # ``list_dir({})``
        # and then
        # hallucinated
        # "Good - there is
        # a PDF" because the
        # tool returned
        # ``"path is
        # required"``
        # (a one-liner
        # that the LLM was
        # free to skip). We
        # now echo the
        # required schema
        # keys + a worked
        # example so the
        # next retry is
        # obviously
        # correct.
        path_str = (input.get("path") or "").strip()
        if not path_str:
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        "path is required but missing from your "
                        "JSON input. Re-call the tool with the "
                        'path as a JSON key, e.g. '
                        '{"path": "/path/to/paper.pdf"}. '
                        "The user gave a path in their message; "
                        "pass it through verbatim."
                    ),
                }
            )
        path = Path(path_str)
        if not path.is_absolute():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": (
                        f"path must be absolute, got {path_str!r}. "
                        "Re-call the tool with a full Windows or "
                        "Unix path. Relative paths are rejected."
                    ),
                }
            )
        if not path.exists():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "not_found",
                    "error": f"directory not found: {path_str}",
                }
            )
        if not path.is_dir():
            return json.dumps(
                {
                    "ok": False,
                    "error_kind": "argument_invalid",
                    "error": f"path is not a directory: {path_str}",
                }
            )
        max_entries = int(input.get("max_entries") or 200)
        max_entries = min(max_entries, 2000)
        entries: list[dict[str, Any]] = []
        for child in sorted(path.iterdir()):
            if child.name.startswith("."):
                continue
            try:
                st = child.stat()
                entries.append(
                    {
                        "name": child.name,
                        "type": (
                            "dir"
                            if child.is_dir()
                            else "file"
                        ),
                        "size": st.st_size,
                    }
                )
            except OSError:
                continue
            if len(entries) >= max_entries:
                break
        return json.dumps(
            {
                "ok": True,
                "path": str(path),
                "entries": entries,
                "truncated": len(entries) >= max_entries,
            },
            ensure_ascii=False,
        )


def register_direct_fs_tools() -> list[Tool]:
    """Return the three direct-fs tools in registration
    order (``read_file``,
    ``ingest_from_path``,
    ``list_dir``). Wired
    into the global tool
    registry by
    ``manusift.tools.registry._load_builtin_tools``.
    """
    return [
        ReadFileTool(),
        IngestFromPathTool(),
        ListDirTool(),
    ]
