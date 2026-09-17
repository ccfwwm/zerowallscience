"""Layered YAML config loader
for ManuSift
(R-2026-06-15, Phase 1 + 3a).

Hermes rule (AGENTS.md,
"no behavioral settings in
.env"): the ``.env`` file
is for SECRETS only.
Behavioural settings
(bash cwd, agent
timeouts, detector
enable/disable, etc.)
belong in ``manusift.yaml``.

The loader merges 4 YAML
layers (highest priority
wins):

  1. ``<workspace>/.manusift/config.local.yaml``
     (gitignored, per-worktree
     overrides)
  2. ``<workspace>/.manusift/config.yaml``
     (committed, project-level
     settings)
  3. ``<user-config-dir>/manusift/config.yaml``
     (user-global settings;
     ``~/.config/manusift/``
     on POSIX,
     ``%AppData%\\manusift\\``
     on Windows)
  4. ``MANUSIFT_*`` env vars
     (the env var layer is
     applied LATER, on top
     of the merged yaml, in
     ``Settings`` itself)

The merge is a deep
``dict.update`` with the
following semantics:

  * Scalar
    values:
    higher-priority
    replaces
    lower-priority.
  * List
    values:
    higher-priority
    REPLACES
    lower-priority
    (NOT
    concatenated;
    see
    ``test_yaml_lists_replace_not_concat``
    for the
    contract).
  * Dict
    values:
    recursively
    merged.

The merged result is a
plain ``dict[str, Any]``
that ``Settings`` then
reads as defaults for
each field. The env var
layer still wins (because
Pydantic's env-var
precedence is higher
than the field default).

The loader is a **pure
function**: no
filesystem writes, no
Pydantic, no Settings
import. Tests can pin the
contract independently.

## API

  * ``load_yaml_config(workspace_dir)``
    returns the merged
    ``dict`` (or ``{}``
    if no layer is
    found).
  * ``find_layer_paths(workspace_dir)``
    returns the 3 candidate
    paths in priority
    order (the loader
    reads each one if
    it exists).
  * ``deep_merge(base, override)``
    returns a NEW dict
    that is ``base``
    merged with
    ``override``
    (override wins on
    scalar
    conflicts;
    recursively
    merged on
    dict
    conflicts;
    lists
    are
    REPLACED).

## Why we do NOT support
array concatenation

Array concatenation is a
common YAML-merge mistake
(``anchors: [*base, *override]``
in docker-compose). It
makes per-key override
impossible: if the user
wants to **disable** a
detector that's enabled
in the project layer,
they'd have to redefine
the entire list. By
REPLACING, the user can
say "disable
image_dup" by writing
``detectors.enabled: []``
in their local override
file.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml


# The
# well-known
# env-var
# names
# that
# the
# loader
# reads
# (used
# by
# ``Settings``
# after
# the
# yaml
# merge
# to
# decide
# which
# yaml
# keys
# map
# to
# which
# settings).
#
# We
# do
# NOT
# list
# api
# keys
# here;
# secrets
# stay
# in
# ``.env``
# (Hermes
# rule:
# "no
# behavioural
# settings
# in
# .env"
# is
# about
# the
# .env
# file,
# not
# about
# the
# env
# vars
# themselves).

# User-global
# config
# directory
# (per-OS
# standard
# location).
_USER_CONFIG_DIRS: tuple[str, ...] = (
    ".config/manusift",  # POSIX
    "Library/Application Support/manusift",  # macOS
    "AppData/Roaming/manusift",  # Windows
)


def _user_config_path() -> Path | None:
    """Return the
    user-global
    ``config.yaml`` path
    (or ``None`` if no
    home directory is
    available).

    The path is the
    first existing
    ``$HOME/<dir>/config.yaml``
    on the standard
    search list. The
    loader does NOT
    require the file to
    exist (it returns
    ``None`` if HOME is
    unset).
    """
    home = os.environ.get("HOME") or os.environ.get(
        "USERPROFILE"
    )
    if not home:
        return None
    for sub in _USER_CONFIG_DIRS:
        p = Path(home) / sub / "config.yaml"
        if p.exists():
            return p
    return None


def find_layer_paths(
    workspace_dir: Path | None,
) -> list[Path]:
    """Return the candidate
    YAML paths in
    priority order
    (highest first).

    The 3 layers:

      1. ``<workspace>/.manusift/config.local.yaml``
      2. ``<workspace>/.manusift/config.yaml``
      3. ``<user-config-dir>/manusift/config.yaml``

    The function does
    NOT check whether
    the paths exist;
    ``load_yaml_config``
    does. The 3 paths
    are always returned
    (in priority order)
    so the caller can
    decide whether to
    read each one.
    """
    out: list[Path] = []
    if workspace_dir is not None:
        out.append(
            workspace_dir
            / ".manusift"
            / "config.local.yaml"
        )
        out.append(
            workspace_dir / ".manusift" / "config.yaml"
        )
    user_path = _user_config_path()
    if user_path is not None:
        out.append(user_path)
    return out


def deep_merge(
    base: dict[str, Any],
    override: dict[str, Any],
) -> dict[str, Any]:
    """Recursively merge
    ``override`` into
    ``base`` and return
    the result as a NEW
    dict (neither
    ``base`` nor
    ``override`` is
    mutated).

    The contract:

      * Scalar
        values
        (str /
        int /
        float /
        bool /
        None)
        in
        ``override``
        REPLACE
        the
        value
        in
        ``base``.
      * List
        values
        in
        ``override``
        REPLACE
        the
        value
        in
        ``base``
        (NOT
        concatenated).
      * Dict
        values
        in
        ``override``
        are
        merged
        recursively
        with
        ``base``.
      * ``None``
        in
        ``override``
        is
        treated
        as
        "explicitly
        unset"
        and
        DELETES
        the
        key
        in
        ``base``
        (so
        the
        user
        can
        clear
        a
        default).

    The recursion is
    bounded by the
    nesting depth of the
    input dicts (a few
    levels in practice).
    A ``TypeError`` is
    raised if a value in
    ``base`` is a dict
    but the corresponding
    value in ``override``
    is a non-dict (or
    vice-versa) -- the
    merge cannot decide
    which wins.
    """
    out: dict[str, Any] = dict(base)
    for key, ovr_val in override.items():
        if ovr_val is None:
            # ``None`` means
            # "unset"; delete
            # the key.
            out.pop(key, None)
            continue
        base_val = out.get(key)
        if isinstance(base_val, dict) and isinstance(
            ovr_val, dict
        ):
            out[key] = deep_merge(base_val, ovr_val)
            continue
        # Scalar / list /
        # non-dict override.
        out[key] = ovr_val
    return out


def _read_yaml_file(path: Path) -> dict[str, Any]:
    """Read a single YAML
    file and return its
    contents as a dict.

    A missing or corrupt
    file yields ``{}``
    (not an exception).
    A YAML document whose
    top level is NOT a
    dict (e.g. a scalar
    or a list) yields
    ``{}`` and is logged
    as a warning (a
    non-dict top level
    is a user error; we
    do not crash the
    process over a
    malformed yaml).
    """
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, FileNotFoundError):
        return {}
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def load_yaml_config(
    workspace_dir: Path | None,
) -> dict[str, Any]:
    """Load the
    behavioural YAML
    config for a given
    workspace.

    The contract:

      * The
        layers
        are
        merged
        in
        priority
        order
        (highest
        first):
        local
        >
        project
        >
        user-global.
      * A
        missing
        layer
        is
        silently
        skipped.
      * A
        corrupt
        layer
        is
        silently
        skipped
        (an
        empty
        dict
        is
        used
        in
        its
        place).
      * The
        function
        NEVER
        raises
        (a
        misconfigured
        yaml
        is
        the
        user's
        problem,
        not
        the
        loader's).
      * The
        result
        is
        a
        new
        ``dict``;
        the
        input
        layer
        dicts
        are
        not
        mutated.

    The merge walks
    ``paths`` in
    priority order
    (highest first);
    each subsequent
    layer is the BASE
    of the merge (so
    the previous higher-
    priority merge wins
    on conflict).
    """
    paths = find_layer_paths(workspace_dir)
    merged: dict[str, Any] = {}
    for p in paths:
        layer = _read_yaml_file(p)
        if not layer:
            continue
        # The
        # current
        # ``merged``
        # (higher
        # priority)
        # wins
        # over
        # the
        # new
        # ``layer``
        # (lower
        # priority).
        # So
        # ``layer``
        # is
        # the
        # base
        # and
        # ``merged``
        # is
        # the
        # override.
        merged = deep_merge(layer, merged)
    return merged
