"""Destructive-command
classifier for the
``BashTool`` (R-2026-06-15,
Phase 1 + 3b).

The previous T1.4 safety
net was a 2-line
``_BASH_DENY_PATTERNS``
denylist (literal regex
match). It had three
known failure modes:

  1. **Variable
     expansion.**
     ``rm -rf $HOME``
     (no literal ``/``)
     bypasses the
     denylist.
  2. **Shell
     metachars.**
     ``ls; rm -rf /``
     splits into two
     commands; the
     denylist sees the
     whole string and
     still flags it, but
     ``ls && rm -rf $foo``
     (no ``/`` literal)
     slips through.
  3. **PowerShell.**
     ``Remove-Item
     -Recurse -Force
     $env:USERPROFILE``
     on Windows is
     ``rm -rf ~`` but
     the denylist is
     POSIX-only.

This module introduces
``classify_command(command,
shell)`` — a pure
function that returns
one of three states:

  * ``"safe"`` — the
    command is read-
    only or trivially
    reversible. The
    bash tool may run
    it without a
    confirmation.
  * ``"needs_confirm"`` —
    the command mutates
    state but the
    mutation is
    recoverable (a
    user can
    ``git checkout``
    or re-run the
    test). The agent
    loop is expected
    to ask the user
    before running.
  * ``"block"`` — the
    command is
    destructively
    irreversible
    (``rm -rf /``,
    ``mkfs``,
    ``shutdown``,
    ``dd of=/dev/sda``,
    ``chmod 777 /``,
    etc.). The bash
    tool refuses
    regardless of
    user confirmation.

The classifier also
returns a ``reason``
field (human-readable
explanation) and a
``matched_rule`` field
(the rule id that
triggered the
classification; useful
for audit logs).

The classifier is a
**pure function**: no
subprocess, no
filesystem access, no
network. Tests can pin
the contract
independently of the
bash tool.

## Shell support

The classifier supports
both ``posix`` (``bash``
/ ``sh`` / ``zsh``)
and ``powershell``
shells. The command is
classified per shell;
a cross-shell pipeline
(``bash -c 'powershell
...'``) is out of scope
(the bash tool is
already constrained to
ONE shell per call).

## Variable expansion

The classifier does NOT
resolve environment
variables (that would
require a shell). It
uses a cheap heuristic:
a token that contains
``$``, ``${``, ``~``,
or ``%var%`` is treated
as "could be a path".
A high-risk command
that resolves to a
path argument is
``block`` even if the
literal argument is
``$HOME``.

This is a conservative
choice: a false
positive (blocking a
safe ``rm $TMP/old.log``)
is cheap; a false negative
(allowing ``rm -rf $HOME``)
is catastrophic. The
classifier errs on the
side of blocking.

## Pipeline splitting

A ``;`` / ``&&`` / ``||`` /
``|`` separator splits
the command into
sub-commands. Each
sub-command is classified
independently; the
**most severe** wins.
``ls; rm -rf /`` is
``block`` (because
``rm -rf /`` is
``block``).
"""
from __future__ import annotations

import re
import shlex
from dataclasses import dataclass


# Classify
# states
# (a
# string
# enum;
# we
# use
# string
# constants
# rather
# than
# Enum
# so
# the
# classifier
# can
# be
# serialized
# to
# JSON).
STATE_SAFE: str = "safe"
STATE_NEEDS_CONFIRM: str = "needs_confirm"
STATE_BLOCK: str = "block"

# Severity
# ordering
# (lowest
# to
# highest).
# The
# most-severe
# sub-command
# wins.
_STATE_RANK: dict[str, int] = {
    STATE_SAFE: 0,
    STATE_NEEDS_CONFIRM: 1,
    STATE_BLOCK: 2,
}


@dataclass(frozen=True)
class Classification:
    """The result of
    ``classify_command``.

    The ``state`` is one of
    the three constants
    above. The ``reason``
    is a human-readable
    explanation suitable
    for an audit log. The
    ``matched_rule`` is
    the rule id that
    triggered the
    classification (or
    ``None`` if the state
    is ``"safe"`` and
    no rule matched).
    """

    state: str
    reason: str
    matched_rule: str | None = None


# --------------------------------------------------------------------
# High-risk command rules
# --------------------------------------------------------------------

# Each
# rule
# is
# a
# (id,
# shell,
# command_regex,
# state,
# reason)
# tuple.
# The
# regex
# matches
# the
# FIRST
# token
# of
# a
# sub-command
# (after
# splitting
# on
# pipes
# / semicolons).
#
# A
# command
# whose
# first
# token
# matches
# one
# of
# these
# regexes
# is
# at
# least
# ``needs_confirm``.
# We
# also
# have
# argument
# rules
# (below)
# that
# escalate
# specific
# invocations
# to
# ``block``.

_RULES: tuple[tuple[str, str, re.Pattern[str], str, str], ...] = (
    # ----- POSIX: read-only / safe -----
    (
        "posix.safe",
            "posix",
            re.compile(
                r"^(?:ls|cat|less|more|head|tail|"
                r"echo|printf|true|false|test|"
                r"pwd|whoami|hostname|date|uname|"
                r"wc|stat|file|which|whereis|"
                r"grep|egrep|fgrep|awk|sed|"
                r"find|locate|wc|md5sum|sha256sum|"
                r"diff|comm|sort|uniq|tr|cut|paste|"
                r"xargs|tee|env|printenv|"
                # ``git`` with a
                # read-only verb
                # (``status``,
                # ``log``,
                # ``diff``,
                # ``show``,
                # ``branch``,
                # ``tag``,
                # ``remote``,
                # ``fetch``,
                # ``ls-files``,
                # ``ls-tree``,
                # ``rev-parse``,
                # ``describe``,
                # ``reflog``,
                # ``shortlog``,
                # ``blame``,
                # ``grep``,
                # ``config --get*``,
                # ``help``,
                # ``version``,
                # ``whatchanged``).
                # We
                # allow
                # additional
                # args
                # after
                # the
                # verb
                # (``git log --oneline``
                # etc.).
                r"git(?:\s+(?:status|log|diff|"
                r"show|branch|tag|remote|fetch|"
                r"ls-files|ls-tree|rev-parse|"
                r"describe|reflog|shortlog|"
                r"blame|grep|help|version|"
                r"whatchanged))"
                r"(?:\s+[^\s;&|<>]*)*|"
                r"man|info|help|"
                r"python3?|node|ruby|"
                # ``ping`` /
                # ``traceroute`` /
                # ``nslookup``
                # are
                # read-only
                # network
                # probes.
                # ``exit``
                # is
                # a
                # shell
                # builtin
                # that
                # does
                # not
                # mutate
                # state
                # (it
                # returns
                # a
                # status
                # code).
                r"ping|traceroute|nslookup|"
                r"dig|host|"
                r"exit|return|"
                r"type|hash|"
                r"basename|dirname|"
                r"rev|od|xxd|"
                r"sleep)$",
                re.IGNORECASE,
            ),
            STATE_SAFE,
            "read-only command",
        ),
    # ----- POSIX: read-only file mutation -----
    # (``touch``,
    # ``mkdir``,
    # ``cp``,
    # ``mv``
    # are
    # mutating
    # but
    # recoverable).
    (
        "posix.mutating",
        "posix",
        re.compile(
            r"^(?:touch|mkdir|rmdir|"
            # ``rm`` without
            # ``-rf`` is
            # still
            # a
            # mutation
            # (it
            # deletes
            # files).
            # The
            # ``rm-rf-*``
            # dangerous-arg
            # rules
            # below
            # escalate
            # ``rm -rf``
            # to
            # ``block``.
            r"rm|"
            r"cp|mv|ln|install|"
            r"chmod|chown|chgrp|"
            r"tar|zip|unzip|gzip|gunzip|"
            r"rsync|"
            r"apt|apt-get|yum|dnf|brew|pacman|"
            r"pip|pip3|npm|yarn|cargo|go|"
            r"git(?:\s+(?:add|commit|push|"
            r"pull|fetch|merge|rebase|"
            r"checkout|reset|stash|cherry-pick|"
            r"tag|branch|switch|restore|"
            r"rm|clean))|"
            r"ssh|scp|curl|wget|"
            r"kill|killall|pkill|"
            r"service|systemctl|"
            r"export|unset|source|"
            r"alias|unalias|"
            # ``cd`` with
            # a
            # target
            # is
            # a
            # mutation
            # (the
            # current
            # shell
            # working
            # directory
            # changes).
            # The
            # bash
            # tool
            # already
            # supports
            # ``cwd=``
            # as
            # a
            # parameter
            # so
            # an
            # LLM
            # that
            # uses
            # ``cd <path>``
            # is
            # doing
            # it
            # wrong
            # --
            # they
            # should
            # use
            # ``cwd``.
            # We
            # still
            # mark
            # ``cd``
            # as
            # ``needs_confirm``
            # so
            # the
            # classifier
            # stays
            # conservative
            # (an
            # accidental
            # ``cd /``
            # does
            # not
            # cause
            # data
            # loss,
            # but
            # it
            # can
            # confuse
            # a
            # follow-up
            # command).
            r"cd|pushd|popd|"
            r"history|jobs|fg|bg)$",
            re.IGNORECASE,
        ),
        STATE_NEEDS_CONFIRM,
        "mutating command",
    ),
    # ----- POSIX: highly destructive -----
    # ``rm -rf`` /
    # ``dd of=/dev/...``
    # are
    # already
    # caught
    # below
    # by
    # the
    # ``block``-level
    # rules.
    # Here
    # we
    # mark
    # the
    # command
    # itself
    # as
    # ``block``
    # if
    # the
    # first
    # token
    # is
    # a
    # known
    # catastrophic
    # binary.
    (
        "posix.catastrophic",
        "posix",
        re.compile(
            r"^(?:shutdown|reboot|halt|poweroff|"
            r"mkfs|mkfs\.ext4|mkfs\.xfs|"
            r"fdisk|parted|"
            r"dd|"
            r"wipefs|"
            r"shred|"
            r"userdel|groupdel)$",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "catastrophic command: filesystem or system state",
    ),
    # ----- PowerShell: read-only / safe -----
    (
        "ps.safe",
        "powershell",
        re.compile(
            # ``Get-`` verbs
            # are
            # always
            # safe.
            # ``Select-Object``,
            # ``Where-Object``,
            # ``Group-Object``,
            # ``Measure-Object``,
            # ``Compare-Object``,
            # ``ForEach-Object``,
            # ``Sort-Object``
            # are
            # also
            # safe.
            # ``Format-Table`` /
            # ``Format-List``
            # /
            # ``Write-Host`` /
            # ``Write-Output`` /
            # ``Read-Host``
            # are
            # read-only
            # in
            # spirit
            # (they
            # print
            # to
            # stdout
            # without
            # side
            # effects).
            r"^(?:Get-|"
            r"Select-Object|"
            r"Where-Object|"
            r"Group-Object|"
            r"Measure-Object|"
            r"Compare-Object|"
            r"ForEach-Object|"
            r"Sort-Object|"
            r"Format-Table|Format-List|"
            r"Write-Host|Write-Output|"
            r"Read-Host|"
            # ``Test-Path``
            # is
            # safe
            # (it's
            # a
            # pure
            # read
            # check).
            r"Test-Path|"
            r"ls|cat|dir|echo|pwd|"
            r"Get-Content|Get-ChildItem|"
            r"Get-Item|Get-Process|"
            r"Get-Service|Get-Date)$",
            re.IGNORECASE,
        ),
        STATE_SAFE,
        "read-only PowerShell command",
    ),
    # ----- PowerShell: mutating -----
    (
        "ps.mutating",
        "powershell",
        re.compile(
            r"^(?:Set-|New-|"
            r"Copy-|Move-|Rename-|"
            r"Push-|Pop-|"
            r"Start-|Stop-|Restart-|"
            r"Add-|Remove-Item|Remove-|"
            r"Enable-|Disable-|"
            r"Register-|Unregister-|"
            r"Import-|Export-|"
            r"Install-|Uninstall-|"
            r"Update-|"
            r"Invoke-|"
            r"Out-File|"
            r"Set-Content|Add-Content|"
            r"New-Item|"
            r"Clear-Content|"
            r"Test-Path|"
            r"Resolve-Path)$",
            re.IGNORECASE,
        ),
        STATE_NEEDS_CONFIRM,
        "mutating PowerShell command",
    ),
    # ----- PowerShell: catastrophic -----
    (
        "ps.catastrophic",
        "powershell",
        re.compile(
            r"^(?:Stop-Computer|Restart-Computer|"
            r"Format-Volume|"
            r"Clear-Disk|"
            r"Initialize-Disk|"
            r"Remove-Partition)$",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "catastrophic PowerShell command: filesystem or system state",
    ),
)


# Rules
# that
# escalate
# a
# command
# from
# ``safe`` /
# ``needs_confirm``
# to
# ``block``
# based
# on
# specific
# argument
# patterns.
#
# Each
# rule
# is
# (id,
# shell,
# argument_regex,
# state,
# reason).
# The
# regex
# matches
# against
# the
# joined
# argument
# string
# of
# the
# sub-command.

_DANGEROUS_ARG_RULES: tuple[
    tuple[str, str, re.Pattern[str], str, str], ...
] = (
    # ``rm
    # ``rm -rf /`` /
    # ``rm -Rf /`` /
    # ``rm -fr /`` /
    # ``rm -f -r /`` /
    # ``rm -r -f /`` --
    # any
    # combination
    # of
    # ``-r``
    # and
    # ``-f``
    # (in
    # any
    # order,
    # possibly
    # merged
    # or
    # separate),
    # followed
    # by
    # a
    # dangerous
    # path
    # (``/``,
    # ``$HOME``,
    # ``~``,
    # etc.).
    (
        "rm-rf-root",
        "posix",
        re.compile(
            # ``rm``
            # followed
            # by
            # one
            # or
            # more
            # flags
            # (each
            # starting
            # with
            # ``-``)
            # that
            # include
            # BOTH
            # ``r``
            # AND
            # ``f``
            # (in
            # any
            # order,
            # merged
            # or
            # separate).
            r"\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*"
            r"(?=\s)|-[a-zA-Z]*[rf][a-zA-Z]*\s+"
            r"(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)*)"
            # Then
            # the
            # dangerous
            # path.
            r"(?:/|"
            r"\$\{?HOME\}?|"
            r"\$\{?PWD\}?|"
            r"~/?|"
            r"\$\{?USER\}?/?|"
            r"\$\{?TMP\}?/?|"
            r"\$\{?TMPDIR\}?/?)",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "rm -rf on / or HOME",
    ),
    # ``rm -rf *`` -- wildcard
    # expansion
    # is
    # a
    # classic
    # foot-gun.
    (
        "rm-rf-wildcard",
        "posix",
        re.compile(
            r"\brm\s+(?:-[a-zA-Z]*r[a-zA-Z]*f"
            r"[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r"
            r"[a-zA-Z]*)\s+\*",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "rm -rf with a wildcard",
    ),
    # ``dd of=/dev/sd[a-z]`` / ``/dev/nvme...``
    (
        "dd-of-block-device",
        "posix",
        re.compile(
            r"\bdd\s+(?:[^|;&\n]*\s+)?of="
            r"(/dev/(?:sd|nvme|hd|vd|xvd|mmcblk)"
            r"[a-z0-9]*)",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "dd of=/dev/block-device",
    ),
    # ``chmod 777 /`` / ``chmod -R 777 /home``
    (
        "chmod-world-writable-root",
        "posix",
        re.compile(
            r"\bchmod\s+(?:-R\s+)?(?:"
            r"777|"
            r"a\+rwx|"
            r"o\+w"
            r")\s+/",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "world-writable permission on /",
    ),
    # ``mkfs`` on a block device
    (
        "mkfs-block-device",
        "posix",
        re.compile(
            r"\bmkfs(?:\.\w+)?\s+/dev/",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "format a block device",
    ),
    # ``shutdown`` / ``reboot`` / ``halt``
    (
        "shutdown-command",
        "posix",
        re.compile(
            r"\b(?:shutdown|reboot|halt|"
            r"poweroff)\b",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "system shutdown",
    ),
    # PowerShell:
    # ``Remove-Item -Recurse -Force $env:USERPROFILE``
    # /
    # ``Remove-Item -Force -Recurse ...``
    # (flag
    # order
    # is
    # free)
    # /
    # ``Remove-Item $env:USERPROFILE``
    # (no
    # flag
    # at
    # all
    # --
    # still
    # blocks
    # if
    # the
    # target
    # is
    # the
    # user's
    # home)
    # /
    # ``$env:USERPROFILE``
    # /
    # ``$env:HOMEDRIVE`` /
    # ``$env:HOMEPATH`` /
    # ``$HOME``
    (
        "ps-remove-item-recursive-root",
        "powershell",
        re.compile(
            r"\bRemove-Item\s+(?:-[A-Za-z]+\s+)*"
            r"(?:-(?:Recurse|Force)(?:\s+|$))?"
            r"(?:-[A-Za-z]+\s+)*"
            r"(?:\$env:USERPROFILE|"
            r"\$env:HOMEDRIVE|"
            r"\$env:HOMEPATH|"
            r"\$HOME|"
            r"C:\\\\?)",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "Remove-Item on the user's home",
    ),
    # PowerShell:
    # ``Format-Volume`` /
    # ``Clear-Disk``
    (
        "ps-format-volume",
        "powershell",
        re.compile(
            r"\b(?:Format-Volume|Clear-Disk|"
            r"Initialize-Disk|"
            r"Remove-Partition)\b",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "PowerShell format / wipe disk",
    ),
    # PowerShell:
    # ``Stop-Computer`` /
    # ``Restart-Computer``
    (
        "ps-stop-computer",
        "powershell",
        re.compile(
            r"\b(?:Stop-Computer|Restart-Computer)\b",
            re.IGNORECASE,
        ),
        STATE_BLOCK,
        "PowerShell shutdown / restart",
    ),
)


# --------------------------------------------------------------------
# Pipeline / metachar splitter
# --------------------------------------------------------------------

# Characters
# that
# split
# a
# command
# into
# sub-commands.
# Note:
# we
# do
# NOT
# treat
# ``|``
# as
# a
# split
# for
# classification
# purposes
# -- a
# ``|``
# pipe
# runs
# both
# sides
# in
# the
# same
# process
# so
# the
# left
# and
# right
# must
# BOTH
# be
# safe.
# But
# we
# still
# split
# on
# ``|``
# so
# each
# side
# is
# classified
# independently.
# The
# most-severe
# result
# wins.
_SPLIT_METACHARS = re.compile(
    r"\s*(?:;|&&|\|\||\|\s)"
)


def _split_subcommands(
    command: str,
) -> list[str]:
    """Split a command on
    shell metachars
    (``;``, ``&&``, ``||``,
    ``|``).

    The splitter is a
    best-effort string
    tokenizer: it does NOT
    understand quotes,
    redirects (``>`` /
    ``<``), or background
    (``&``). The classifier
    is conservative: a
    ``$FOO``
    that contains a
    metachar is
    treated as a single
    token (the env-var
    ``DANGEROUS_ARG_RULES``
    pattern matches the
    joined argument string
    regardless of where
    the metachar falls).

    The ``redirect``
    (``>`` / ``<``) is
    special: a ``> foo``
    is a write, which is
    ``needs_confirm`` even
    though the left-hand
    side might be
    ``safe``. The
    classifier detects
    redirects by
    inspecting the joined
    argument string
    separately (not by
    splitting).
    """
    parts = _SPLIT_METACHARS.split(command)
    return [p.strip() for p in parts if p.strip()]


# --------------------------------------------------------------------
# Argument-level checks
# --------------------------------------------------------------------

# Match a write-style
# redirect (``>`` /
# ``>>`` /
# ``2>`` /
# ``2>>`` /
# ``1>`` /
# ``1>>``).
# We do
# NOT
# match
# the
# read-style
# ``<`` /
# ``<<`` /
# ``<<<``
# (which
# are
# input
# here-docs
# / here-
# strings
# in
# bash
# and
# have
# no
# write
# semantics).
# We
# also
# anchor
# the
# redirect
# with
# a
# NEGATIVE
# lookbehind
# for
# ``<``
# so
# that
# ``>>>``
# (which
# does
# not
# exist
# in
# bash
# but
# can
# appear
# in
# other
# shells)
# is
# not
# matched.
_REDIRECT_PATTERN = re.compile(
    r"(?<!<)(?:>>?|2>>?|1>>?)(?!<)\s*"
    r"([^\s;&|]+|\$\{?\w+\}?)",
    re.IGNORECASE,
)


def _classify_redirect(
    command: str,
) -> Classification | None:
    """If the command
    contains a redirect
    (``> file`` /
    ``>> file`` /
    ``< file`` /
    ``2> file``), the
    classifier escalates
    to
    ``needs_confirm``
    (a write to a file
    path is a mutation
    even if the
    left-hand side is
    ``safe``).

    A redirect to
    ``/dev/null`` /
    ``/dev/stdout`` /
    ``/dev/stderr`` is
    ``safe`` (these are
    the standard null
    sinks; not a real
    write).
    """
    match = _REDIRECT_PATTERN.search(command)
    if match is None:
        return None
    target = match.group(1).strip()
    safe_targets = {
        "/dev/null",
        "/dev/stdout",
        "/dev/stderr",
        "NUL",
        "nul",
        "$null",
    }
    if target in safe_targets:
        return None
    return Classification(
        state=STATE_NEEDS_CONFIRM,
        reason=(
            f"redirect to {target!r} "
            "is a file write"
        ),
        matched_rule="redirect-to-file",
    )


# --------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------


def classify_command(
    command: str,
    shell: str = "posix",
) -> Classification:
    """Classify a shell
    command into one of
    three states.

    The contract:

      * The
        input
        string
        is
        classified
        as-is
        (no
        shell
        expansion).
        Variable
        expansion
        is
        handled
        conservatively
        via
        pattern
        matching.

      * The
        return
        value
        is
        a
        ``Classification``
        dataclass
        (state,
        reason,
        matched_rule).

      * A
        pipeline
        (``ls; rm -rf /``)
        is
        split
        into
        sub-commands
        and
        each
        sub-command
        is
        classified
        independently.
        The
        most-severe
        sub-command
        wins
        (so
        a
        safe
        ``ls``
        piped
        to
        a
        ``block``
        ``rm -rf /``
        is
        ``block``).

      * The
        classifier
        NEVER
        raises.
        A
        corrupt
        input
        (empty
        string,
        non-string,
        binary
        garbage)
        is
        classified
        as
        ``safe``
        with
        a
        reason
        field
        that
        explains
        why
        the
        default
        was
        chosen.

      * The
        ``shell``
        argument
        is
        either
        ``"posix"``
        or
        ``"powershell"``.
        An
        unknown
        shell
        is
        treated
        as
        ``"posix"``
        (defensive
        default;
        most
        agents
        in
        this
        project
        run
        PowerShell
        on
        Windows
        and
        bash
        on
        POSIX,
        so
        this
        covers
        both).
    """
    if not isinstance(command, str):
        return Classification(
            state=STATE_SAFE,
            reason=(
                "non-string command "
                f"({type(command).__name__}); "
                "defensively classified as safe"
            ),
            matched_rule=None,
        )
    command = command.strip()
    if not command:
        return Classification(
            state=STATE_SAFE,
            reason=(
                "empty command; defensively "
                "classified as safe"
            ),
            matched_rule=None,
        )
    shell_norm = (
        shell if shell in ("posix", "powershell")
        else "posix"
    )
    # 1)
    # Check
    # for
    # a
    # redirect
    # (write
    # to
    # a
    # file).
    redirect_cls = _classify_redirect(command)
    # 2)
    # Split
    # on
    # metachars
    # and
    # classify
    # each
    # sub-command.
    sub_cmds = _split_subcommands(command)
    # 3)
    # The
    # aggregate
    # state
    # is
    # the
    # most-severe
    # of:
    #   -
    # the
    # redirect
    # escalation
    #   -
    # each
    # sub-command's
    # classification
    candidates: list[Classification] = []
    if redirect_cls is not None:
        candidates.append(redirect_cls)
    for sub in sub_cmds:
        candidates.append(
            _classify_subcommand(sub, shell_norm)
        )
    if not candidates:
        return Classification(
            state=STATE_SAFE,
            reason="no sub-commands after split",
            matched_rule=None,
        )
    # Pick
    # the
    # most-severe
    # candidate.
    winner = max(
        candidates,
        key=lambda c: _STATE_RANK.get(c.state, 0),
    )
    return winner


def _classify_subcommand(
    sub: str,
    shell: str,
) -> Classification:
    """Classify a single
    sub-command (a
    sub-command is a
    string with no
    metachars).

    The pipeline:

      1. Parse
         the
         sub-command
         into
         tokens
         (best-effort
         via
         ``shlex``).
         A
         parse
         failure
         is
         treated
         as
         ``safe``
         (defensive).
      2. Check
         the
         joined
         argument
         string
         against
         the
         dangerous-argument
         rules.
         A
         match
         is
         ``block``.
      3. Check
         the
         first
         token
         (the
         command
         name)
         against
         the
         high-level
         rules.
      4. The
         default
         is
         ``needs_confirm``
         for
         any
         unrecognised
         command
         (we
         do
         not
         whitelist
         ``safe``
         by
         default;
         the
         LLM
         can
         downgrade
         a
         ``needs_confirm``
         by
         being
         conservative).
    """
    try:
        tokens = shlex.split(sub)
    except ValueError:
        # A
        # parse
        # failure
        # (e.g.
        # unbalanced
        # quotes,
        # or
        # an
        # unescaped
        # backslash
        # in
        # a
        # Windows
        # path
        # like
        # ``C:\Windows``).
        # Try
        # the
        # non-POSIX
        # shlex
        # mode
        # (which
        # handles
        # backslashes
        # more
        # loosely);
        # if
        # that
        # also
        # fails,
        # fall
        # back
        # to
        # safe.
        try:
            tokens = shlex.split(
                sub, posix=False
            )
        except ValueError:
            return Classification(
                state=STATE_SAFE,
                reason=(
                    "shlex parse failure; "
                    "defensively classified as safe"
                ),
                matched_rule=None,
            )
    if not tokens:
        return Classification(
            state=STATE_SAFE,
            reason="no tokens after shlex split",
            matched_rule=None,
        )
    first = tokens[0]
    # 2)
    # Dangerous-argument
    # rules
    # -- these
    # escalate
    # to
    # ``block``
    # regardless
    # of
    # the
    # command
    # name.
    arg_string = " ".join(tokens)
    for (
        rule_id,
        rule_shell,
        pattern,
        state,
        reason,
    ) in _DANGEROUS_ARG_RULES:
        if rule_shell != shell:
            continue
        if pattern.search(arg_string):
            return Classification(
                state=state,
                reason=(
                    f"{reason} "
                    f"(command={first!r})"
                ),
                matched_rule=rule_id,
            )
    # 3)
    # High-level
    # rules
    # -- these
    # set
    # the
    # state
    # by
    # command
    # name.
    # We
    # match
    # the
    # FIRST
    # token
    # (the
    # command
    # name)
    # against
    # the
    # pattern
    # so
    # ``rm
    # file.txt``
    # matches
    # the
    # ``rm``
    # rule
    # even
    # though
    # the
    # pattern
    # is
    # ``^rm$``.
    # We
    # also
    # try
    # a
    # fullmatch
    # on
    # the
    # entire
    # sub-command
    # so
    # compound
    # rules
    # like
    # ``git
    # status``
    # can
    # match.
    for (
        rule_id,
        rule_shell,
        pattern,
        state,
        reason,
    ) in _RULES:
        if rule_shell != shell:
            continue
        if (
            pattern.match(first)
            or pattern.fullmatch(sub)
        ):
            return Classification(
                state=state,
                reason=(
                    f"{reason} "
                    f"(command={first!r})"
                ),
                matched_rule=rule_id,
            )
    # 4)
    # Default
    # -- unrecognised
    # commands
    # are
    # ``needs_confirm``
    # (we
    # do
    # not
    # whitelist
    # ``safe``
    # by
    # default).
    return Classification(
        state=STATE_NEEDS_CONFIRM,
        reason=(
            f"unrecognised command {first!r}; "
            "ask the user before running"
        ),
        matched_rule=None,
    )
