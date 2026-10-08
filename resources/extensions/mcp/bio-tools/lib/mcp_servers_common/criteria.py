"""Shared guards for explicitly provided empty search criteria.

An omitted optional criterion may intentionally select a documented browse
mode. A provided empty or whitespace-only string must never silently widen the
request into an unfiltered listing.
"""

from __future__ import annotations

__all__ = ["blank", "none_if_blank", "reject_blank"]


def blank(value: object) -> bool:
    """Return True for a provided empty or whitespace-only string."""
    return isinstance(value, str) and not value.strip()


def none_if_blank(value):
    """Normalize a blank optional string to the omitted value ``None``."""
    return None if blank(value) else value


def reject_blank(_mapping=None, **criteria) -> None:
    """Raise ``ValueError`` naming every explicitly blank criterion."""
    bad = sorted(
        {
            key
            for source in (_mapping or {}, criteria)
            for key, value in source.items()
            if blank(value)
        }
    )
    if bad:
        raise ValueError(
            f"{', '.join(bad)} must be non-empty when provided; "
            "omit the parameter for the documented default or provide a value"
        )
