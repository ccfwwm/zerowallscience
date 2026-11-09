"""Tool-argument redactor (P1.5, R-2026-06-14).

Some tool arguments contain
secret-shaped values: API keys,
tokens, file paths under the
user's home, command invocations
that include ``-p <password>``,
etc. The TUI's tool-trace block
displays the raw input to the user
so they can audit what the LLM
did. The redactor replaces secret
shapes with a typed placeholder
before the value lands in the
trace / log / report bundle.

Contract:

  * ``redact_input(input_dict)`` returns a
    deep-copied dict with sensitive
    values replaced by
    ``"<redacted:api_key>"`` (or
    similar). The original dict is not
    mutated.
  * ``redact_output(output_str)`` returns
    a copy of the tool's output string
    with the same redactions applied
    (e.g. a ``cat /home/me/.env`` call
    that printed an API key).
  * The redactor is deliberately
    conservative: it matches *shape*
    (e.g. ``sk-`` / ``ghp_`` / long
    hex strings labelled as ``key``)
    not *value*. False positives are
    preferred over leaks.

Pattern follows claw-code's
``rust/crates/tools/src/redact.rs``
(redact on the way into the trace,
not on the way out of the tool).
"""
from __future__ import annotations

import copy
import re
from typing import Any


# PII-shaped regexes. Each tuple is
# ``(placeholder, compiled_regex)``.
# Order matters: longer / more
# specific patterns first.
_HOME = re.compile(
    r"(?P<home>"
    r"(?:[A-Za-z]:[\\\\/])?"  # optional Windows drive
    r"(?:Users|home|root|var)[\\\\/]"
    r"[A-Za-z0-9._-]+"
    r")"
)
_API_KEY = re.compile(
    r"(?P<key>"
    r"sk-[A-Za-z0-9]{16,}"
    r"|sk-ant-[A-Za-z0-9-]{16,}"
    r"|ghp_[A-Za-z0-9]{16,}"
    r"|gho_[A-Za-z0-9]{16,}"
    r"|xox[abprs]-[A-Za-z0-9-]{8,}"
    r"|ANTHROPIC_API_KEY=[A-Za-z0-9-]{16,}"
    r"|OPENAI_API_KEY=[A-Za-z0-9-]{16,}"
    r")"
)
_PASSWORD = re.compile(
    r"(?P<pw>"
    r"(?:-p|--password|--api-key|--token)\s+"
    r"(?P<value>[^\s'\";&|<>]+)"
    r")"
)
_BEARER = re.compile(
    r"(?P<bearer>Bearer\s+[A-Za-z0-9._-]{8,})"
)
# Anything labelled "key", "token",
# "secret" in a key, with a value
# of >= 8 chars.
_KV_SECRET = re.compile(
    r"(?P<kv>"
    r"(?:api[_-]?key|access[_-]?token|auth[_-]?token|"
    r"secret|client[_-]?secret|"
    r"private[_-]?key)"
    r"\s*[=:]\s*"
    r"['\"]?"
    r"(?P<value>[A-Za-z0-9._+/-]{8,})"
    r"['\"]?"
    r")",
    re.IGNORECASE,
)


_PLACEHOLDER_HOME = "<redacted:user_home>"
_PLACEHOLDER_API_KEY = "<redacted:api_key>"
_PLACEHOLDER_PASSWORD = "<redacted:password>"
_PLACEHOLDER_BEARER = "<redacted:bearer_token>"


# Keys whose values are always redacted
# regardless of value shape.
_ALWAYS_REDACT_KEYS = {
    "api_key",
    "apikey",
    "api-key",
    "access_token",
    "access-token",
    "auth_token",
    "auth-token",
    "secret",
    "client_secret",
    "client-secret",
    "private_key",
    "private-key",
    "password",
    "passwd",
    "pwd",
    "token",
    "anthropic_api_key",
    "openai_api_key",
    "minimax_api_key",
    "hf_token",
}


def _redact_string(s: str) -> str:
    """Apply all redactor patterns to a string."""
    s = _API_KEY.sub(_PLACEHOLDER_API_KEY, s)
    s = _BEARER.sub(_PLACEHOLDER_BEARER, s)
    s = _PASSWORD.sub(
        lambda m: m.group(0).replace(
            m.group("value"),
            _PLACEHOLDER_PASSWORD,
        ),
        s,
    )
    s = _KV_SECRET.sub(
        lambda m: m.group(0).replace(
            m.group("value"),
            _PLACEHOLDER_PASSWORD,
        ),
        s,
    )
    s = _HOME.sub(_PLACEHOLDER_HOME, s)
    return s


def _redact_value(v: Any) -> Any:
    """Recursively redact a value, returning a
    deep copy. Strings get the regex
    pass; dicts and lists recurse.
    """
    if isinstance(v, str):
        return _redact_string(v)
    if isinstance(v, dict):
        return {
            k: (
                "<redacted:secret_key>"
                if k.lower() in _ALWAYS_REDACT_KEYS
                else _redact_value(val)
            )
            for k, val in v.items()
        }
    if isinstance(v, list):
        return [_redact_value(x) for x in v]
    if isinstance(v, tuple):
        return tuple(_redact_value(x) for x in v)
    return v


def redact_input(input_dict: Any) -> Any:
    """Return a redacted deep-copy of a tool's
    input. Safe to call on ``None`` (returns
    ``None``).
    """
    if input_dict is None:
        return None
    return _redact_value(copy.deepcopy(input_dict))


def redact_output(output: Any) -> Any:
    """Return a redacted deep-copy of a tool's
    output. Output is often a JSON string;
    the redactor handles both the string form
    and the dict / list form.
    """
    if output is None:
        return None
    if isinstance(output, str):
        return _redact_string(output)
    return _redact_value(copy.deepcopy(output))
