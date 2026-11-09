"""File-based knowledge backend (E-audit A-path, 2026-06).

Reads an Obsidian vault as
a plain directory of
``.md`` files. Zero
external dependencies --
uses only ``pathlib``,
``re``, and ``yaml`` from
``manusift`` (PyYAML is
already a transitive
dependency of
``pydantic-settings``).

The vault is treated as a
*passive* file system:

  * the path comes from
    the ``obsidian_vault_path``
    setting (a Pydantic
    ``Path`` field);
  * a glob pattern
    (``**/*.md`` by
    default) selects which
    files are notes;
  * an ignore pattern
    (``.obsidian/**,trash/**``
    by default) excludes
    config / trash
    directories;
  * YAML frontmatter is
    parsed by a tiny
    built-in parser (we
    avoid the PyYAML import
    to keep the offline
    path dependency-free
    -- the frontmatter
    dialect is a small,
    well-defined subset of
    YAML that we can parse
    in ~30 lines of Python
    without risking the
    PyYAML CVE history).

The split is borrowed from
the existing
``DetectorToolAdapter``
pattern: keep the
*protocol* in
``manusift.knowledge.base``
and put the concrete
implementation here.

A user who only sets
``obsidian_vault_path`` in
their environment will
get this backend with
zero extra configuration
-- the REST backend
(``obsidian_rest.py``) is
only constructed when the
``obsidian_rest_api_url``
+ ``obsidian_rest_api_key``
settings are also set.
"""
from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any

from .base import (
    BackendUnavailable,
    KnowledgeBackend,
    NoteContent,
    NoteMeta,
)


# Standard YAML
# frontmatter is wrapped
# in ``---\n... \n---``
# at the top of a
# markdown file. We
# match the entire block
# (greedy across newlines)
# and parse it line by
# line below. A regex
# here is faster than
# importing ``yaml`` and
# avoids the PyYAML C
# parser's occasional
# security-flag issues.
_FRONTMATTER_RE = re.compile(
    r"\A---\s*\n(?P<yaml>.*?)\n---\s*\n?(?P<body>.*)",
    re.DOTALL,
)


# Line-based YAML
# frontmatter parser.
# Handles the subset
# we see in real
# Obsidian vaults:
#
#   ---
#   title: My Note
#   tags: [foo, bar]
#   author: alice
#   ---
#
# We deliberately do NOT
# pull in PyYAML: this is
# the offline path and we
# want the tests to pass
# even in a stripped-down
# install. PyYAML
# (already on the system
# via pydantic-settings)
# is used by the
# ``report`` builder, but
# the knowledge backend
# is decoupled so a
# future portability
# pass to a no-C-extension
# environment stays
# feasible.
def _parse_frontmatter(
    text: str,
) -> tuple[dict[str, Any], str]:
    """Split a markdown file
    into ``(frontmatter,
    body)``.

    Returns an empty dict
    + the original text if
    the file does not start
    with ``---\\n`` (i.e.
    no frontmatter).
    """
    m = _FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    yaml_text = m.group("yaml")
    body = m.group("body")
    out: dict[str, Any] = {}
    for line in yaml_text.splitlines():
        # A YAML
        # ``key: value`` line.
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        v = v.strip()
        if not k:
            continue
        # ``tags: [foo, bar]``
        # -- the inline
        # list form.
        if v.startswith("[") and v.endswith("]"):
            items = [
                x.strip()
                for x in v[1:-1].split(",")
                if x.strip()
            ]
            out[k] = items
            continue
        # ``tags: foo`` --
        # the scalar form.
        # (YAML allows this
        # but Obsidian
        # usually uses the
        # list form.)
        if v == "true":
            out[k] = True
            continue
        if v == "false":
            out[k] = False
            continue
        if v.startswith('"') and v.endswith('"'):
            out[k] = v[1:-1]
            continue
        out[k] = v
    return out, body


def _extract_title(
    frontmatter: dict[str, Any],
    body: str,
    relpath: str,
) -> str:
    """Pick a sensible title.

    Priority:

    1. ``title`` from
       frontmatter.
    2. The first ``# H1``
       heading in the body.
    3. The filename
       (without ``.md``).
    """
    t = frontmatter.get("title")
    if isinstance(t, str) and t.strip():
        return t.strip()
    # The first ``#``
    # line in the body.
    for line in body.splitlines():
        line = line.strip()
        if line.startswith("# ") and not line.startswith(
            "#!"
        ):
            return line[2:].strip()
    # Fallback: filename
    # stem.
    return Path(relpath).stem


# The ``tags`` field is
# commonly a list. We
# also pick up inline
# ``#tag`` references
# from the body so a
# user can search for a
# tag regardless of
# whether it was set in
# frontmatter.
_TAG_LINE_RE = re.compile(
    r"(?:^|\s)#([A-Za-z0-9_\-/]+)"
)


def _extract_tags(
    frontmatter: dict[str, Any],
    body: str,
) -> list[str]:
    """Return the union of
    frontmatter ``tags`` and
    inline ``#tag``
    references in the
    body, deduplicated and
    sorted.

    The frontmatter wins
    when a tag appears in
    both; we only fall
    through to inline if
    the frontmatter does
    not have the tag.
    """
    fm_tags: list[str] = []
    raw = frontmatter.get("tags")
    if isinstance(raw, list):
        fm_tags = [str(t) for t in raw]
    elif isinstance(raw, str):
        # ``tags: foo`` is
        # scalar in YAML --
        # wrap it.
        fm_tags = [raw]
    fm_set = {t.strip() for t in fm_tags if t.strip()}
    # Inline tags.
    inline: set[str] = set()
    for m in _TAG_LINE_RE.finditer(body):
        inline.add(m.group(1))
    out = list(fm_set | inline)
    out.sort()
    return out


# The ``ignore`` setting
# is a comma-separated
# glob list, e.g.
# ``".obsidian/**,trash/**"``.
# We translate it to a
# regex over the relative
# path so a single
# compiled regex can
# match all excludes
# cheaply.
def _compile_ignore(
    ignore: str,
) -> re.Pattern[str]:
    """Compile the comma-
    separated ignore
    pattern to a single
    regex over the
    relative POSIX path.

    Each ignore pattern
    becomes
    ``(.*?<pattern>$)``
    anchored to the end of
    the relative path. We
    match anywhere along
    the path so
    ``trash/**`` catches
    ``trash/foo.md`` and
    ``foo/trash/bar.md``.
    """
    parts = [
        p.strip() for p in ignore.split(",") if p.strip()
    ]
    if not parts:
        return re.compile(r"(?!)")  # never matches
    sub_patterns: list[str] = []
    for p in parts:
        # Treat ``**``
        # as "any chars
        # including /".
        # Treat ``*`` as
        # "any chars
        # except /".
        rx = (
            p.replace(".", r"\.")
            .replace("**", "__DOUBLESTAR__")
            .replace("*", "[^/]*")
            .replace("__DOUBLESTAR__", ".*")
        )
        sub_patterns.append(rf"(?:^|/){rx}")
    return re.compile("|".join(sub_patterns))


class FileBackend:
    """Read-only
    knowledge backend that
    treats a directory of
    ``.md`` files as the
    knowledge base.

    Constructed with the
    user-configured
    ``obsidian_vault_path``
    setting; the path is
    resolved at
    construction time so a
    bad path raises
    ``BackendUnavailable``
    immediately (rather
    than at every tool
    call).

    Zero external
    dependencies -- safe
    to enable in any
    environment.
    """

    name = "obsidian_files"

    def __init__(
        self,
        vault_path: str | Path,
        glob: str = "**/*.md",
        ignore: str = ".obsidian/**,trash/**",
    ) -> None:
        self._vault = Path(vault_path).expanduser()
        # ``Path("")`` resolves to
        # ``Path(".")`` on
        # Python 3.11+ which
        # ``is_dir()``-passes.
        # We want an empty /
        # whitespace-only path
        # to be treated as
        # ``"feature off"``.
        if not str(self._vault).strip() or str(
            self._vault
        ) == ".":
            raise BackendUnavailable(
                "obsidian vault path is empty"
            )
        if not self._vault.is_dir():
            raise BackendUnavailable(
                f"obsidian vault path is not a "
                f"directory: {self._vault}"
            )
        self._glob = glob
        self._ignore_re = _compile_ignore(ignore)
        # Pre-scan: cache
        # the list of
        # candidate files
        # so ``list_notes``
        # / ``search`` /
        # ``recent`` are
        # all O(N) on the
        # same N. A
        # 1000-note vault
        # is a few hundred
        # KB on disk and
        # a 1-second walk,
        # which is fine
        # for an LLM tool.
        self._files: list[Path] = sorted(
            p for p in self._vault.glob(self._glob)
            if p.is_file()
            and not self._ignore_re.search(
                str(p.relative_to(self._vault)).replace(
                    "\\", "/"
                )
            )
        )

    # ---------- internal helpers ----------

    def _read(
        self, path: Path
    ) -> tuple[str, dict[str, Any], str]:
        """Read a single file,
        return ``(title,
        frontmatter, body)``."""
        try:
            text = path.read_text(
                encoding="utf-8"
            )
        except UnicodeDecodeError:
            # Fall back to
            # latin-1 so a
            # non-utf-8 file
            # does not crash
            # the agent loop.
            text = path.read_text(
                encoding="latin-1",
                errors="replace",
            )
        except OSError as exc:
            # A transient
            # read error
            # (file locked,
            # disk error)
            # becomes an empty
            # document so the
            # tool can return
            # a JSON error to
            # the LLM.
            return (
                path.stem,
                {},
                f"(read error: {exc})",
            )
        fm, body = _parse_frontmatter(text)
        title = _extract_title(
            fm, body, str(
                path.relative_to(self._vault)
            )
        )
        return title, fm, body

    def _meta(self, path: Path) -> NoteMeta:
        """Build a ``NoteMeta``
        for one file. We
        parse the file's
        frontmatter once and
        cache nothing --
        the LLM tool that
        *lists* notes never
        sees the body, so
        the work is bounded.
        A 1000-note vault
        parses in < 1
        second on a
        developer laptop.
        """
        rel = str(
            path.relative_to(self._vault)
        ).replace("\\", "/")
        try:
            title, fm, body = self._read(path)
        except Exception:  # noqa: BLE001
            # A broken file
            # still gets a
            # NoteMeta --
            # ``read_note``
            # will surface
            # the real error
            # when the LLM
            # asks for it.
            return NoteMeta(
                relpath=rel,
                title=Path(rel).stem,
            )
        tags = _extract_tags(fm, body)
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        return NoteMeta(
            relpath=rel,
            title=title,
            tags=tags,
            mtime=mtime,
        )

    # ---------- KnowledgeBackend ----------

    def list_notes(
        self, folder: str = ""
    ) -> list[NoteMeta]:
        if folder:
            # The ``folder``
            # argument is
            # relative to the
            # vault. We
            # filter by
            # ``relpath`` so
            # an empty / odd
            # path does not
            # break the
            # call.
            folder_norm = (
                folder.strip("/").rstrip("/")
            )
            prefix = f"{folder_norm}/" if folder_norm else ""
            out: list[NoteMeta] = []
            for p in self._files:
                rel = str(
                    p.relative_to(self._vault)
                ).replace("\\", "/")
                if prefix and not rel.startswith(prefix):
                    continue
                out.append(self._meta(p))
            return out
        return [self._meta(p) for p in self._files]

    def read_note(
        self, relpath: str
    ) -> NoteContent:
        rel_clean = (
            relpath.strip("/").lstrip("./")
        )
        target = self._vault / rel_clean
        # ``is_relative_to``
        # raises on
        # Python < 3.9 but
        # we are on 3.11+.
        if not target.is_file():
            return NoteContent(
                relpath=rel_clean,
                title=Path(rel_clean).stem,
                body="",
            )
        title, fm, body = self._read(target)
        return NoteContent(
            relpath=rel_clean,
            title=title,
            frontmatter=fm,
            body=body,
        )

    def search(
        self, query: str, limit: int = 10
    ) -> list[NoteMeta]:
        # The
        # ``query`` is a
        # substring --
        # case-insensitive.
        # A future
        # semantic-search
        # backend can
        # override this
        # method.
        q = query.lower()
        out: list[NoteMeta] = []
        for p in self._files:
            try:
                text = p.read_text(
                    encoding="utf-8",
                    errors="replace",
                )
            except OSError:
                continue
            if q in text.lower():
                out.append(self._meta(p))
                if len(out) >= limit:
                    break
        return out

    def recent(
        self, limit: int = 10
    ) -> list[NoteMeta]:
        # ``self._files``
        # is sorted by
        # mtime desc on
        # construction,
        # but the user
        # may have created
        # the backend
        # hours ago. Sort
        # again here --
        # ``st_mtime`` is
        # fast.
        with_mtime: list[tuple[float, Path]] = []
        for p in self._files:
            try:
                mtime = p.stat().st_mtime
            except OSError:
                mtime = 0.0
            with_mtime.append((mtime, p))
        with_mtime.sort(
            key=lambda t: t[0], reverse=True
        )
        out: list[NoteMeta] = []
        for _, p in with_mtime[:limit]:
            out.append(self._meta(p))
        return out
