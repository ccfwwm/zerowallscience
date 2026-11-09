"""R-2026-06-15 (Phase 0.11) test
lint plugin: warn if a test
that looks like a
``change_detector`` test
never actually exercises
a detector.

The plugin is a thin
finalizer. At session
teardown it scans the
collected test items and
emits a warning for any
test whose name or
docstring contains
``change_detector`` /
``image_dup`` /
``stat_grim`` etc.
keywords, but whose body
does not call the
detector or assert any
detector output.

The plugin is **tolerant**:
tests that have a
``# no-detector-required``
marker (in a docstring or
as a comment) are
skipped. This avoids
noisy warnings for
"the test does not exist
yet" placeholders.

Usage in ``pyproject.toml``::

    [tool.pytest.ini_options]
    addopts = "-p manusift.tests.change_detector_lint"

Pattern follows the
agent-infra-iteration-
engineer skill rule I.4:
pure helper + thin wiring,
both tested.
"""
from __future__ import annotations

import re
from typing import Iterable

import pytest


# Keywords that suggest a
# test is *about* a
# change-detector.
_DETECTOR_KEYWORDS = (
    "change_detector",
    "image_dup",
    "image_duplication",
    "stat_grim",
    "statistical_",
    "p_value",
    "duplicate",
    "duplication",
    "pct",
    "panel_extraction",
    "source_data_audit",
    "data_audit",
)

# Compile a single
# case-insensitive regex
# that matches any of
# the keywords.
_PATTERN = re.compile(
    "|".join(
        re.escape(k) for k in _DETECTOR_KEYWORDS
    ),
    re.IGNORECASE,
)


def _is_detector_test(
    test_name: str,
    docstring: str | None,
) -> bool:
    """Return ``True`` if the
    test name or docstring
    mentions a
    change-detector
    keyword.
    """
    if _PATTERN.search(test_name):
        return True
    if docstring and _PATTERN.search(docstring):
        return True
    return False


def _has_no_detector_marker(
    test_name: str,
    docstring: str | None,
) -> bool:
    """Return ``True`` if the
    test is explicitly
    opted out of the lint
    check.
    """
    if "# no-detector-required" in test_name:
        return True
    if (
        docstring
        and "# no-detector-required" in docstring
    ):
        return True
    return False


def collect_warnings(
    tests: Iterable[pytest.Item],
) -> list[str]:
    """Return a list of human-
    readable warning
    messages, one per test
    that looks like a
    change-detector test
    but does not appear
    to exercise one.
    """
    warnings: list[str] = []
    for item in tests:
        name = item.name
        docstring = getattr(
            item.function, "__doc__", None
        )
        if not _is_detector_test(name, docstring):
            continue
        if _has_no_detector_marker(name, docstring):
            continue
        # Cheap heuristic: a
        # detector test
        # should mention
        # ``detector`` or
        # the detector
        # name in its
        # assertions.
        source = getattr(
            item.function, "__code__", None
        )
        if source is None:
            # Not a Python
            # function
            # (e.g. doctest
            # items).
            continue
        co_names = set(source.co_names)
        detector_tokens = {
            "detector",
            "run_change_detector",
            "image_dup",
            "stat_grim",
            "source_data_audit",
        }
        if not (
            detector_tokens & co_names
        ):
            warnings.append(
                f"change_detector_lint: {item.nodeid} "
                f"looks like a change-detector test "
                f"but does not call any detector. "
                f"Add ``# no-detector-required`` "
                f"if intentional."
            )
    return warnings


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(
    session: pytest.Session,
    exitstatus: int,
) -> None:
    """At session teardown,
    scan the collected
    items and emit a
    warning for any test
    that looks like a
    change-detector test
    but never exercises
    one.
    """
    warnings = collect_warnings(
        session.items
    )
    if not warnings:
        return
    for w in warnings:
        # ``summary`` would
        # also work but
        # ``warn`` is
        # visible in the
        # test output
        # even when the
        # session passed.
        session.config.warn(
            "MANUSIFT-CHANGE-DETECTOR-LINT",
            w,
        )
