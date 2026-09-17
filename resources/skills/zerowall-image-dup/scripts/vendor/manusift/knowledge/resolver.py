"""Knowledge-backend resolver (E-audit, 2026-06).

Pick the right backend
based on the user's
settings. The rules:

  * If both
    ``obsidian_rest_api_url``
    AND
    ``obsidian_rest_api_key``
    are set, prefer
    ``RestBackend`` (live
    data, the user has
    gone to the trouble
    of installing the
    plugin + accepting
    the cert).

  * Otherwise, fall back
    to ``FileBackend``
    (the offline path).
    This is the
    default and the
    path 99% of users
    will use.

  * If neither is
    configured (empty
    vault path AND empty
    REST URL), return
    ``None``. The
    knowledge tools
    will surface a
    "vault not
    configured" error
    to the LLM so the
    user knows what to
    do.

The resolver is the
*only* place that reads
the Settings fields
related to the knowledge
base. The tools just
call ``resolve_backend()``
and use the result.
"""
from __future__ import annotations

import logging
from typing import Any

from .base import (
    BackendUnavailable,
    KnowledgeBackend,
)

log = logging.getLogger(__name__)


def resolve_backend(
    settings: Any,
) -> KnowledgeBackend | None:
    """Return the right
    backend for the user's
    configuration, or
    ``None`` if neither
    path is set.

    The resolver is
    defensive: a bad
    configuration (e.g.
    REST URL set but the
    plugin is not
    running) is logged
    and the function falls
    back to the file
    backend if a vault
    path is also set, or
    returns ``None``
    otherwise. The caller
    (``register_knowledge_tools``)
    wraps this in a
    try / except so a
    crashed resolver never
    blocks the agent loop.
    """
    # 1) REST preferred
    # when fully
    # configured.
    rest_url = getattr(
        settings, "obsidian_rest_api_url", ""
    )
    rest_key_obj = getattr(
        settings, "obsidian_rest_api_key", None
    )
    rest_key = (
        rest_key_obj.get_secret_value()
        if rest_key_obj
        else ""
    )
    if rest_url and rest_key:
        try:
            from .obsidian_rest import RestBackend
            return RestBackend(
                api_url=rest_url,
                api_key=rest_key,
                verify_tls=getattr(
                    settings,
                    "obsidian_rest_api_verify_tls",
                    True,
                ),
            )
        except BackendUnavailable as exc:
            log.warning(
                "obsidian REST backend not "
                "available: %s",
                exc,
            )
            # Fall through to
            # the file
            # backend so the
            # user can still
            # use the offline
            # path if they
            # set both a
            # vault path AND
            # a REST URL.
    # 2) File backend
    # (the default).
    vault_path = getattr(
        settings, "obsidian_vault_path", None
    )
    if vault_path and str(vault_path):
        try:
            from .obsidian_files import FileBackend
            return FileBackend(
                vault_path=vault_path,
                glob=getattr(
                    settings,
                    "obsidian_vault_glob",
                    "**/*.md",
                ),
                ignore=getattr(
                    settings,
                    "obsidian_vault_ignore",
                    ".obsidian/**,trash/**",
                ),
            )
        except BackendUnavailable as exc:
            log.warning(
                "obsidian file backend not "
                "available: %s",
                exc,
            )
            return None
    # 3) Nothing
    # configured -- the
    # knowledge tools
    # will surface a
    # friendly "vault
    # not configured"
    # error to the LLM.
    return None
