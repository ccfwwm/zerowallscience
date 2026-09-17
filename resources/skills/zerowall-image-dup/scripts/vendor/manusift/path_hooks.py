"""Path-detection and pre-processing for user turns
(R-audit 2026-06-11).

Problem: LLMs are unreliable at extracting filesystem paths
from free-text turns. A user may paste an absolute path (with
or without quotes) plus natural language, and the model often
narrates "I will register the PDF" without calling
``ingest_from_path``, or calls it with an empty JSON body.

Fix: **deterministic pre-processing** of the user turn. If a
path-like string is detected, inject the obvious tool calls
before the model acts; the model then continues from real tool
results. Prefer code for path extraction over prompt-only
instructions.

## The three pre-canned
## tool calls

If the user message
contains a path, we
inject:

  1. ``list_dir(path)``
     -- to discover the
     companion files
     (manifest,
     case_summary, etc.)
  2. ``ingest_from_path(path)``
     -- if path is a PDF,
     register it; if
     path is a directory,
     find the PDF inside
     and register it.
  3. ``read_file(<manifest>)``
     -- read the case
     summary / manifest
     for context.

The pre-canned tool
calls run **before** the
LLM sees the user
message. The LLM's
first turn therefore
sees a conversation
that already has the
PDF registered, the
case summary read, and
the manifest available.
The LLM is then free to
narrate, run detectors,
or do whatever it
wants. The user gets a
working result either
way.

## Why this is safe

  * The pre-canned tool
    calls are run with
    the **same
    permission gate** as
    the LLM's tool calls
    -- the user can
    disable direct-FS
    access via
    ``MANUSIFT_ALLOW_DIRECT_FS=False``.
  * If a path is not
    detected in the user
    message, no
    pre-canned tool calls
    are injected and the
    LLM is on its own.
  * The pre-canned tool
    calls are *idempotent
    with retry* -- if the
    LLM later calls
    ``ingest_from_path``
    with the same path,
    the detector is
    smart enough to
    return the existing
    trace_id (the LLM
    noted this in its
    narration: "被去重
    挡住了").

## The path extractor

The regex matches
Windows paths
(``C:\\Users\\...``) and
Unix paths
(``/home/...``). It
handles the common
forms:

  * bare path
  * path in double-quotes
  * path in single-quotes
  * path followed by
    punctuation
  * path with trailing
    Chinese text

The function returns
the *longest* path it
finds (in case the
message has multiple).
The pre-processor picks
the first one that
exists on disk.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# Match a Windows or Unix absolute path.
# The path is captured WITHOUT the surrounding
# quotes -- the extractor strips them.
# Examples that match:
#   C:\Users\alice\paper.pdf
#   "C:\Users\alice\paper.pdf"
#   /home/alice/paper.pdf
#   '/home/alice/paper.pdf'
#   C:\Users\alice\docs\paper  (with trailing Chinese text)
#   C:\path\with spaces\paper.pdf
#
# The path stops at the first Chinese character,
# whitespace, quote, or newline.
_PATH_RE = re.compile(
    r"([A-Za-z]:[\\/][^\u4e00-\u9fff\s\"'\n\r]+"
    r"|"
    r"[/][^\u4e00-\u9fff\s\"'\n\r]+)"
)

_QUOTED_PATH_RE = re.compile(
    r"(?P<quote>[\"'])"
    r"(?P<path>"
    r"(?:[A-Za-z]:[\\/]|[/])"
    r"(?:(?!\u4e00-\u9fff).)*?"
    r")"
    r"(?P=quote)"
)

_TRAILING_PATH_PUNCTUATION = " \t,.;:!?)]}>，。；：、）】》"


def _before_chinese_or_line_end(text: str, start: int) -> str:
    """Return the unquoted path-like segment that starts at
    ``start`` and ends before CJK text, quotes, or a line
    break.
    """
    end = start
    while end < len(text):
        ch = text[end]
        if ch in "\"'\n\r":
            break
        if "\u4e00" <= ch <= "\u9fff":
            break
        end += 1
    return text[start:end]


def _longest_existing_prefix(segment: str, min_len: int) -> str | None:
    """Return the longest existing filesystem path at the
    front of ``segment``.

    Bare Windows paths often contain spaces. Regex alone can
    not know where such a path ends and ordinary prose begins,
    so we use the filesystem as the tie-breaker when the user
    pasted a real path.
    """
    for end in range(len(segment), min_len - 1, -1):
        candidate = segment[:end].rstrip(_TRAILING_PATH_PUNCTUATION)
        if len(candidate) < min_len:
            continue
        try:
            if Path(candidate).exists():
                return candidate
        except OSError:
            continue
    return None


def extract_paths(text: str) -> list[Path]:
    """Pull out all
    Windows / Unix
    absolute paths from
    ``text``.

    The function is
    permissive:
      * Paths may be
        wrapped in
        single or
        double
        quotes
        (the
        quote
        characters
        are
        stripped
        before
        the
        match
        is
        returned).
      * The path may be
        followed
        by
        Chinese
        punctuation
        or
        characters
        (the
        match
        stops
        at
        the
        first
        Chinese
        character).
      * The path may
        contain
        spaces.

    Returns the paths in
    the order they
    appear in the text.
    Duplicate paths (same
    string) are
    de-duplicated.
    """
    seen: set[str] = set()
    out: list[Path] = []
    matches: list[str] = []
    for m in _QUOTED_PATH_RE.finditer(text):
        matches.append(m.group("path"))
    for m in _PATH_RE.finditer(text):
        raw_match = m.group(0)
        if any(raw_match in quoted for quoted in matches):
            continue
        segment = _before_chinese_or_line_end(text, m.start())
        extended = _longest_existing_prefix(
            segment, min_len=len(raw_match)
        )
        matches.append(extended or raw_match)
    for raw in matches:
        # Strip
        # surrounding
        # quotes.
        raw = raw.strip("\"'")
        if not raw:
            continue
        if raw in seen:
            continue
        # ``Path.is_absolute()``
        # is
        # platform-dependent
        # --
        # on
        # Windows
        # a
        # Unix-style
        # path
        # like
        # ``/home/alice/...``
        # is
        # reported
        # as
        # *not*
        # absolute
        # (it
        # is
        # a
        # root-relative
        # path).
        # We
        # accept
        # anything
        # that
        # looks
        # like
        # a
        # path
        # (starts
        # with
        # a
        # drive
        # letter
        # or
        # a
        # slash)
        # and
        # let
        # ``find_first_existing_path``
        # decide
        # if
        # it
        # is
        # real.
        looks_like_path = (
            (len(raw) >= 2 and raw[1] == ":")
            or raw.startswith("/")
            or raw.startswith("\\")
        )
        if not looks_like_path:
            continue
        # Normalize
        # the
        # path
        # --
        # we
        # do
        # NOT
        # call
        # ``Path.resolve()``
        # because
        # the
        # path
        # might
        # not
        # exist
        # yet
        # (e.g.
        # a
        # future
        # workspace
        # path).
        p = Path(raw)
        seen.add(raw)
        out.append(p)
    return out


def find_first_existing_path(paths: list[Path]) -> Path | None:
    """Return the first
    path in ``paths``
    that exists on disk
    (file or directory),
    or None if none of
    them exist.

    This is the
    "user-friendly" pick:
    the LLM might emit
    several paths in its
    narration; we pick
    the one that is
    actually a real
    path. If none exist,
    we return None and
    the agent falls back
    to letting the LLM
    try.
    """
    for p in paths:
        try:
            if p.exists():
                return p
        except OSError:
            # Permission
            # error
            # or
            # other
            # OS
            # issue
            # --
            # skip
            # this
            # path.
            continue
    return None


def find_pdf_in_dir(directory: Path) -> Path | None:
    """Find the most
    likely PDF in
    ``directory``.

    Strategy:
      1. If the
        directory
        contains
        exactly
        one
        ``.pdf``
        file,
        return
        it.
      2. Otherwise
        return
        the
        ``.pdf``
        with
        the
        shortest
        name
        (heuristic:
        it's
        the
        "main"
        paper).
      3. If
        no
        ``.pdf``
        files
        are
        present,
        return
        None.
    """
    if not directory.is_dir():
        return None
    pdfs = sorted(
        [p for p in directory.iterdir() if p.suffix.lower() == ".pdf"]
    )
    if not pdfs:
        return None
    if len(pdfs) == 1:
        return pdfs[0]
    # Heuristic:
    # the
    # PDF
    # whose
    # name
    # is
    # shortest
    # is
    # the
    # "main"
    # paper.
    return min(pdfs, key=lambda p: len(p.name))


def is_probably_a_path(token: str) -> bool:
    """Quick check: does
    ``token`` look like
    a path?

    Used by the
    pre-processor to
    filter out false
    positives (e.g.
    ``C:`` alone is not
    a path).
    """
    p = Path(token)
    if not p.is_absolute():
        return False
    if len(p.parts) < 2:
        return False
    return True


def build_pre_canned_tool_calls(
    user_text: str,
) -> list[dict[str, Any]]:
    """Build the
    pre-canned tool
    calls for a user
    turn.

    The function is
    pure -- it does
    NOT execute the
    tool calls. It
    returns a list of
    ``{"name": ...,
    "input": ...}``
    dicts that the
    caller can inject
    into the agent
    loop's tool-use
    sequence.

    Strategy:

      1. Extract
        all
        paths
        from
        the
        user
        text.
      2. Pick
        the
        first
        existing
        one.
      3. If
        it's
        a
        directory,
        find
        the
        PDF
        inside.
      4. Build
        the
        tool
        call
        list:
        - ``list_dir(path)``
          (if
          path
          is
          a
          directory)
        - ``ingest_from_path(pdf_path)``
          (if
          we
          found
          a
          PDF)
        - ``read_file(manifest)``
          (if
          there's
          a
          case_summary.json
          /
          manifest.json
          in
          the
          directory)

    The list is in the
    order the agent
    should run them.
    """
    paths = extract_paths(user_text)
    existing: list[Path] = []
    for p in paths:
        try:
            if p.exists():
                existing.append(p)
        except OSError:
            continue
    if not existing:
        return []
    out: list[dict[str, Any]] = []
    # Step
    # 1:
    # if
    # the
    # picked
    # path
    # is
    # a
    # directory,
    # list
    # it
    # first
    # so
    # the
    # LLM
    # sees
    # what's
    # there.
    pdf_path: Path | None = None
    pdf_container: Path | None = None
    for picked in existing:
        if picked.suffix.lower() == ".pdf" and picked.exists():
            pdf_path = picked
            pdf_container = picked.parent
            break
        if picked.is_dir():
            found_pdf = find_pdf_in_dir(picked)
            if found_pdf is not None:
                pdf_path = found_pdf
                pdf_container = picked
                break
    for picked in existing:
        if picked.is_dir():
            out.append(
                {
                    "name": "list_dir",
                    "input": {"path": str(picked)},
                }
            )
    data_paths: list[str] = []
    for picked in existing:
        if pdf_path is not None and picked == pdf_path:
            continue
        if picked.is_dir():
            if pdf_container is not None and picked == pdf_container:
                # The PDF parser already scans the paper's
                # own directory for companion files.
                continue
            data_paths.append(str(picked))
        elif picked.suffix.lower() != ".pdf":
            data_paths.append(str(picked))
    if not out and existing[0].is_dir():
        out.append(
            {
                "name": "list_dir",
                "input": {"path": str(existing[0])},
            }
        )
    # Step
    # 2:
    # ingest
    # the
    # PDF.
    if pdf_path is not None and pdf_path.exists():
        ingest_input: dict[str, Any] = {"path": str(pdf_path)}
        if data_paths:
            ingest_input["data_paths"] = data_paths
        out.append(
            {
                "name": "ingest_from_path",
                "input": ingest_input,
            }
        )
    # Step
    # 3:
    # if
    # the
    # directory
    # has
    # a
    # manifest
    # or
    # case
    # summary,
    # read
    # it.
    for picked in existing:
        if not picked.is_dir():
            continue
        for companion in (
            "case_summary.json",
            "manifest.json",
            "collection_report.md",
        ):
            companion_path = picked / companion
            if companion_path.exists():
                out.append(
                    {
                        "name": "read_file",
                        "input": {"path": str(companion_path)},
                    }
                )
                # Only
                # read
                # the
                # first
                # companion
                # --
                # we
                # do
                # not
                # want
                # to
                # flood
                # the
                # context
                # window.
                break
    return out
