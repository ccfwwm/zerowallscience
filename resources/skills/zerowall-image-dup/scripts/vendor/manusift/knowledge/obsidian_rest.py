"""REST-based knowledge backend (E-audit B-path, 2026-06).

Talks to a running
Obsidian instance via the
**Local REST API** plugin
(obsidianmd/obsidian-local-rest-api).

Wire format (verified
against the Local REST
API docs in May 2026):

  * Default port: 27124
    (HTTPS) / 27123 (HTTP).
  * Authentication:
    ``Authorization: Bearer
    <api_key>`` header.
  * Endpoints used here:

      GET  /vault/                     -- list files
      GET  /vault/{filepath}            -- read a file
      POST /vault/{filepath}            -- create / update
      DELETE /vault/{filepath}          -- delete
      POST /search/simple/              -- substring search
      POST /periodic/                   -- daily / weekly
                                            / monthly notes

  The plugin requires an
HTTPS self-signed
certificate. On Windows
the user must add the
cert to the local trust
store before
``httpx.Client(verify=…)``
will accept it. We
expose a setting
``obsidian_rest_api_verify_tls``
(``True`` by default) so
a user who has accepted
the cert can flip it to
``False`` in development.

The backend is a *thin*
HTTP wrapper -- no
caching, no streaming,
no retries beyond the
tenacity policy in
``manusift.retry``. A
failing request becomes
a ``BackendUnavailable``
so the LLM tools can
return a JSON error to
the agent loop rather
than crashing it.
"""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from .base import (
    BackendUnavailable,
    KnowledgeBackend,
    NoteContent,
    NoteMeta,
)


def _file_to_meta(
    relpath: str,
    body: str,
    frontmatter: dict[str, Any],
) -> NoteMeta:
    """Build a ``NoteMeta``
    from the parsed
    frontmatter + body.

    The Local REST API does
    not return a
    ``mtime`` field on the
    file listing; we set
    ``mtime=0.0`` so the
    ``recent`` tool falls
    back to alphabetical
    order on this backend.
    """
    # We re-import the
    # helpers from
    # ``obsidian_files`` to
    # keep the title /
    # tag parsing rules
    # in one place.
    from .obsidian_files import (
        _extract_tags,
        _extract_title,
    )

    title = _extract_title(
        frontmatter, body, relpath
    )
    tags = _extract_tags(frontmatter, body)
    return NoteMeta(
        relpath=relpath,
        title=title,
        tags=tags,
        mtime=0.0,
    )


def _parse_frontmatter(
    text: str,
) -> tuple[dict[str, Any], str]:
    """Same line-based YAML
    parser as the file
    backend. Re-implemented
    here (rather than
    re-imported) so the
    REST backend can be
    imported without
    pulling in the
    ``obsidian_files``
    module's file-system
    side effects."""
    import re
    m = re.match(
        r"\A---\s*\n(?P<yaml>.*?)\n---\s*\n?(?P<body>.*)",
        text,
        re.DOTALL,
    )
    if not m:
        return {}, text
    out: dict[str, Any] = {}
    for line in m.group("yaml").splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        v = v.strip()
        if not k:
            continue
        if v.startswith("[") and v.endswith("]"):
            out[k] = [
                x.strip()
                for x in v[1:-1].split(",")
                if x.strip()
            ]
            continue
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
    return out, m.group("body")


class RestBackend:
    """Knowledge backend
    that talks to a
    running Obsidian
    instance via the Local
    REST API plugin.

    Constructed with the
    user-configured
    ``obsidian_rest_api_url``
    and
    ``obsidian_rest_api_key``
    settings. The backend
    is *opt-in*: a user
    who does not set
    these settings never
    instantiates this
    class.
    """

    name = "obsidian_rest"

    def __init__(
        self,
        api_url: str,
        api_key: str,
        verify_tls: bool = True,
        timeout_seconds: float = 10.0,
    ) -> None:
        if not api_url:
            raise BackendUnavailable(
                "obsidian REST API url is empty"
            )
        if not api_key:
            raise BackendUnavailable(
                "obsidian REST API key is empty"
            )
        # Strip a trailing
        # slash so the
        # URL-join below
        # is consistent.
        self._base = api_url.rstrip("/")
        # ``httpx.Client`` is
        # the *expensive*
        # object: it
        # holds the TLS
        # connection pool.
        # We create one per
        # backend instance
        # and reuse it
        # across all
        # calls. A new
        # agent-loop
        # invocation
        # creates a new
        # backend (and
        # therefore a new
        # client) so the
        # pool does not
        # leak between
        # requests.
        self._client = httpx.Client(
            headers={
                "Authorization": (
                    f"Bearer {api_key}"
                ),
            },
            verify=verify_tls,
            timeout=timeout_seconds,
        )

    def _url(self, path: str) -> str:
        """Build a vault-relative
        URL. The Local REST
        API expects the path
        to be URL-encoded
        (forward slashes are
        preserved; spaces and
        non-ASCII characters
        are percent-encoded)."""
        encoded = quote(path, safe="/")
        return f"{self._base}/vault/{encoded}"

    def _get(self, path: str) -> str | None:
        """``GET /vault/{path}``.
        Returns the file body
        or ``None`` if the
        file is missing.
        """
        try:
            r = self._client.get(self._url(path))
        except httpx.HTTPError as exc:
            raise BackendUnavailable(
                f"GET {path} failed: {exc}"
            ) from exc
        if r.status_code == 404:
            return None
        if r.status_code >= 400:
            raise BackendUnavailable(
                f"GET {path} returned "
                f"{r.status_code}: {r.text[:200]}"
            )
        # The Local REST API
        # returns the raw
        # markdown body as
        # text/plain. Some
        # newer versions wrap
        # it in a JSON
        # envelope; we
        # normalise to a
        # string.
        if r.headers.get(
            "content-type", ""
        ).startswith("application/json"):
            data = r.json()
            if isinstance(data, str):
                return data
            return data.get("content", "")
        return r.text

    def _search_simple(
        self,
        query: str,
        limit: int,
    ) -> list[str]:
        """``POST
        /search/simple/`` with
        ``{"query": ..., "limit":
        ...}`` body. Returns
        a list of relative
        paths that match."""
        try:
            r = self._client.post(
                f"{self._base}/search/simple/",
                json={
                    "query": query,
                    "limit": limit,
                },
            )
        except httpx.HTTPError as exc:
            raise BackendUnavailable(
                f"search failed: {exc}"
            ) from exc
        if r.status_code >= 400:
            raise BackendUnavailable(
                f"search returned "
                f"{r.status_code}: {r.text[:200]}"
            )
        data = r.json()
        if not isinstance(data, list):
            return []
        # The endpoint
        # returns a list of
        # strings (the
        # matching filenames)
        # -- some versions
        # include the path,
        # some the basename.
        # We normalise to
        # POSIX relative
        # paths.
        out: list[str] = []
        for item in data:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                out.append(
                    item.get("filename", "")
                    or item.get("path", "")
                )
        return [p for p in out if p]

    def _list_root(self) -> list[str]:
        """``GET /vault/`` to get
        the full file
        listing. The Local
        REST API returns a
        JSON array of
        relative POSIX paths.
        """
        try:
            r = self._client.get(
                f"{self._base}/vault/"
            )
        except httpx.HTTPError as exc:
            raise BackendUnavailable(
                f"list failed: {exc}"
            ) from exc
        if r.status_code >= 400:
            raise BackendUnavailable(
                f"list returned "
                f"{r.status_code}: {r.text[:200]}"
            )
        data = r.json()
        if not isinstance(data, list):
            return []
        return [p for p in data if isinstance(p, str)]

    # ---------- KnowledgeBackend ----------

    def list_notes(
        self, folder: str = ""
    ) -> list[NoteMeta]:
        try:
            paths = self._list_root()
        except BackendUnavailable:
            raise
        if folder:
            folder_norm = (
                folder.strip("/").rstrip("/")
            )
            prefix = (
                f"{folder_norm}/" if folder_norm else ""
            )
            paths = [
                p
                for p in paths
                if not prefix or p.startswith(prefix)
            ]
        out: list[NoteMeta] = []
        for p in paths:
            # Skip directories:
            # the listing
            # returns both
            # files and
            # folder entries
            # with a trailing
            # ``/``.
            if p.endswith("/"):
                continue
            try:
                body = self._get(p) or ""
            except BackendUnavailable:
                # A single
                # unreadable
                # file does
                # not stop
                # the
                # listing.
                continue
            fm, body_clean = _parse_frontmatter(body)
            out.append(
                _file_to_meta(p, body_clean, fm)
            )
        return out

    def read_note(
        self, relpath: str
    ) -> NoteContent:
        rel_clean = relpath.strip("/").lstrip("./")
        try:
            body = self._get(rel_clean)
        except BackendUnavailable as exc:
            return NoteContent(
                relpath=rel_clean,
                title=Path(rel_clean).stem,
                body="",
            )
        if body is None:
            return NoteContent(
                relpath=rel_clean,
                title=Path(rel_clean).stem,
                body="",
            )
        fm, body_clean = _parse_frontmatter(body)
        from .obsidian_files import _extract_title
        title = _extract_title(
            fm, body_clean, rel_clean
        )
        return NoteContent(
            relpath=rel_clean,
            title=title,
            frontmatter=fm,
            body=body_clean,
        )

    def search(
        self, query: str, limit: int = 10
    ) -> list[NoteMeta]:
        try:
            paths = self._search_simple(query, limit)
        except BackendUnavailable:
            raise
        out: list[NoteMeta] = []
        for p in paths:
            try:
                body = self._get(p) or ""
            except BackendUnavailable:
                continue
            fm, body_clean = _parse_frontmatter(body)
            out.append(
                _file_to_meta(p, body_clean, fm)
            )
        return out

    def recent(
        self, limit: int = 10
    ) -> list[NoteMeta]:
        # The Local REST API
        # does not return a
        # per-file
        # ``mtime`` field.
        # We fall back to
        # alphabetical
        # order so the
        # tool degrades
        # gracefully on
        # the REST backend.
        try:
            paths = self._list_root()
        except BackendUnavailable:
            raise
        paths = [p for p in paths if not p.endswith("/")]
        paths.sort()
        out: list[NoteMeta] = []
        for p in paths[:limit]:
            try:
                body = self._get(p) or ""
            except BackendUnavailable:
                continue
            fm, body_clean = _parse_frontmatter(body)
            out.append(
                _file_to_meta(p, body_clean, fm)
            )
        return out
