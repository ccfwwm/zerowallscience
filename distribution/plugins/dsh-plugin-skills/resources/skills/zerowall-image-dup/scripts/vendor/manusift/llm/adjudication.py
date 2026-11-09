"""LLM adjudication (P1.2) — second-pass verdicts on high issues.

Pipeline position: calibration → aggregation → **adjudication** → enrichment.

The calibration layer (``finding_calibration``) only re-maps severities and
the enrichment layer (``llm.enrichment``) only writes narrative verdicts;
neither drops a finding. Adjudication sits between them: each *high* issue
is shown to the LLM once and judged

* ``actionable``  — a real concern, keep the high severity;
* ``explainable`` — a benign explanation exists, demote members high→medium;
* ``uncertain``   — not enough evidence either way, keep severity.

Demotion never removes a finding: a new ``Finding`` is built (same style as
``finding_calibration``) and the verdict is recorded in
``raw["adjudication"]`` for audit. Parse failures and LLM errors always fall
back to ``uncertain`` — the conservative direction keeps the finding high.

Cost guardrails
---------------
* ``MANUSIFT_LLM_ADJUDICATE`` — gate, default **off** (fully independent of
  ``MANUSIFT_LLM_ENRICH_MODE``). Off means zero LLM calls and the inputs are
  returned unchanged.
* ``MANUSIFT_LLM_ADJUDICATE_MAX_ISSUES`` — per-paper cap on adjudicated
  issues (default 20; ``<=0`` = no limit). Overflow is truncated after
  sorting by severity/member_count and the truncation is logged.
* Issues sharing one fingerprint (``enrichment.fingerprint`` of the
  representative member) are asked once; the verdict is broadcast to the
  whole cluster.
"""
from __future__ import annotations

import json
from typing import Any, Protocol

from ..contracts import Finding
from ..report.finding_aggregation import Issue, aggregate_findings
from ..trace import get_logger
from .enrichment import _env_flag, _env_int, fingerprint

log = get_logger(__name__)

_SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3}

_VALID_VERDICTS = frozenset({"actionable", "explainable", "uncertain"})

ADJUDICATION_VERSION = "manusift.adjudication.v1"

# Representative members embedded per issue; the rest is summarised as a
# count so the prompt stays small on 100+-member issues.
_MAX_CONTEXT_MEMBERS = 5


class _AdjudicateClient(Protocol):
    name: str

    def is_available(self) -> bool: ...


def adjudication_enabled() -> bool:
    """Gate: adjudication runs only when explicitly switched on."""
    return _env_flag("MANUSIFT_LLM_ADJUDICATE", False)


def _representative(issue: Issue, members: list[Finding]) -> Finding:
    """Highest-severity member, ties broken by finding_id (deterministic)."""
    return sorted(
        members,
        key=lambda f: (-_SEV_RANK.get(str(f.severity), 0), f.finding_id),
    )[0]


def _issue_context(issue: Issue, members: list[Finding]) -> dict[str, Any]:
    """Compact per-issue payload sent to the LLM (top members + count)."""
    ranked = sorted(
        members,
        key=lambda f: (-_SEV_RANK.get(str(f.severity), 0), f.finding_id),
    )
    shown = ranked[:_MAX_CONTEXT_MEMBERS]
    return {
        "issue_id": issue.issue_id,
        "kind": issue.kind,
        "severity": issue.severity,
        "title": issue.title,
        "detectors": list(issue.detectors),
        "member_count": issue.member_count,
        "members": [
            {
                "detector": f.detector,
                "severity": f.severity,
                "title": (f.title or "")[:160],
                "location": (f.location or "")[:120],
                "evidence": (f.evidence or "")[:300],
            }
            for f in shown
        ],
        "truncated_members": max(0, len(members) - len(shown)),
    }


def _build_prompt(context: dict[str, Any]) -> str:
    return (
        "You are a research-integrity adjudicator for automated detector "
        "findings in an academic-paper screening pipeline. Below is ONE "
        "aggregated issue (a cluster of related detector findings). Decide:\n"
        '- "actionable": a genuine integrity concern that needs human review;\n'
        '- "explainable": a benign/technical explanation plausibly accounts '
        "for ALL signals (e.g. intentional derived columns, reused template "
        "figure, expected pre-processing);\n"
        '- "uncertain": evidence is insufficient to decide.\n'
        "When in doubt, choose \"uncertain\". Respond with a single JSON "
        'object only (no markdown): {"verdict": "actionable"|"explainable"|'
        '"uncertain", "reason": "<one or two sentences>"}.\n\n'
        f"ISSUE:\n{json.dumps(context, ensure_ascii=False, indent=2)}"
    )


def _parse_verdict(payload: Any) -> tuple[str, str]:
    """Coerce an LLM payload to ``(verdict, reason)``; garbage → uncertain."""
    if not isinstance(payload, dict):
        return "uncertain", ""
    verdict = str(payload.get("verdict") or "").strip().lower()
    if verdict not in _VALID_VERDICTS:
        return "uncertain", ""
    reason = str(payload.get("reason") or "")[:300]
    return verdict, reason


def _ask_llm(client: Any, context: dict[str, Any]) -> tuple[str, str]:
    """One adjudication call. Any failure degrades to ``uncertain``."""
    try:
        # Prefer a dedicated method when the client provides one (tests,
        # future providers); otherwise reuse the raw-prompt path the
        # enrichment layer already relies on. Prompt caching is a provider
        # concern handled inside ``_call_raw_prompt``.
        if hasattr(client, "adjudicate_issue"):
            return _parse_verdict(client.adjudicate_issue(context))
        if hasattr(client, "_call_raw_prompt"):
            from .client.providers import _extract_json_object

            raw = client._call_raw_prompt(_build_prompt(context), max_tokens=400)
            return _parse_verdict(_extract_json_object(raw or ""))
    except Exception as exc:  # noqa: BLE001
        log.debug("llm adjudication call failed: %s", exc)
    return "uncertain", ""


def _demote(finding: Finding, *, issue_id: str, reason: str) -> Finding:
    """Build a medium copy of a high finding with an audit record."""
    prior = str(finding.severity or "info")
    raw = dict(finding.raw) if isinstance(finding.raw, dict) else {}
    raw["adjudication"] = {
        "verdict": "explainable",
        "reason": reason,
        "issue_id": issue_id,
        "prior_severity": prior,
        "version": ADJUDICATION_VERSION,
    }
    return Finding(
        finding_id=finding.finding_id,
        trace_id=finding.trace_id,
        detector=finding.detector,
        severity="medium",
        title=finding.title,
        evidence=finding.evidence,
        location=finding.location,
        raw=raw,
        llm_verdict=finding.llm_verdict,
        llm_skipped=finding.llm_skipped,
    )


def adjudicate_issues(
    findings: list[Finding],
    issues: list[Issue],
    *,
    client: Any = None,
    enabled: bool | None = None,
    max_issues: int | None = None,
) -> tuple[list[Finding], list[Issue]]:
    """Adjudicate high issues; demote explainable ones high→medium.

    Returns ``(findings, issues)`` — new lists when any member was demoted
    (issues are re-aggregated from the adjudicated findings), the input
    objects unchanged otherwise. Inputs are never mutated. Findings are
    never dropped.
    """
    if enabled is None:
        enabled = adjudication_enabled()
    if not enabled:
        return findings, issues

    if client is None:
        from .client import get_llm_client

        client = get_llm_client()
    if getattr(client, "name", "") == "mock":
        return findings, issues
    try:
        if not client.is_available():
            return findings, issues
    except Exception:  # noqa: BLE001
        return findings, issues

    by_id = {f.finding_id: f for f in findings}
    candidates = [i for i in issues if i.severity == "high"]
    if not candidates:
        return findings, issues

    # Cost cap: largest/most-severe issues win the budget.
    candidates.sort(
        key=lambda i: (-_SEV_RANK.get(i.severity, 0), -i.member_count, i.issue_id)
    )
    if max_issues is None:
        max_issues = _env_int("MANUSIFT_LLM_ADJUDICATE_MAX_ISSUES", 20)
    if max_issues > 0 and len(candidates) > max_issues:
        log.info(
            "llm adjudication truncated",
            extra={"candidates": len(candidates), "max_issues": max_issues},
        )
        candidates = candidates[:max_issues]

    # Dedup: one LLM call per representative fingerprint, broadcast to the
    # whole cluster of issues sharing it.
    clusters: dict[str, list[tuple[Issue, list[Finding]]]] = {}
    for issue in candidates:
        members = [by_id[fid] for fid in issue.finding_ids if fid in by_id]
        if not members:
            continue
        key = fingerprint(_representative(issue, members))
        clusters.setdefault(key, []).append((issue, members))

    demoted: dict[str, Finding] = {}
    calls = 0
    for _key, group in clusters.items():
        # Adjudicate the first issue of the fingerprint cluster; all issues
        # in the cluster share the verdict.
        issue, members = group[0]
        verdict, reason = _ask_llm(client, _issue_context(issue, members))
        calls += 1
        if verdict != "explainable":
            continue
        for g_issue, g_members in group:
            for f in g_members:
                if f.severity == "high" and f.finding_id not in demoted:
                    demoted[f.finding_id] = _demote(
                        f, issue_id=g_issue.issue_id, reason=reason
                    )

    log.info(
        "llm adjudication",
        extra={
            "issues": len(candidates),
            "clusters": len(clusters),
            "llm_calls": calls,
            "demoted": len(demoted),
        },
    )
    if not demoted:
        return findings, issues

    out_findings = [demoted.get(f.finding_id, f) for f in findings]
    return out_findings, aggregate_findings(out_findings)
