"""Fast LLM enrichment: templates + cluster fan-out + batch API.

Problem
-------
Nature SI papers produce 1000+ high/medium findings. One API call per
finding is hours of DeepSeek time. Most hits share the same *pattern*
(``cross_table_fixed_offset``, Benford column, …).

Strategy
--------
1. **Templates** for well-structured ``check`` / ``kind`` values — zero API.
2. **Cluster** remaining findings by fingerprint; enrich one representative.
3. **Batch** several representatives into one LLM request (JSON array).
4. **Broadcast** the representative verdict to every member of the cluster.

Every high/medium finding ends with either ``llm_verdict`` set or
``llm_skipped=True``. Detectors / severities are never mutated.

Config (env)
------------
``MANUSIFT_LLM_ENRICH_MODE``
  * ``cluster_batch`` (default) — full path above
  * ``cap`` — legacy: first N findings only, 1:1 calls
  * ``off`` — mark all eligible skipped

``MANUSIFT_LLM_ENRICH_MAX``
  * cluster_batch: max *clusters* sent to LLM (default 200; 0 = no limit)
  * cap: max findings (default 48)

``MANUSIFT_LLM_BATCH_SIZE`` — findings per API request (default 12)

``MANUSIFT_LLM_TEMPLATE_CHECKS`` — ``1``/``0`` enable templates (default 1)
"""
from __future__ import annotations

import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from dataclasses import dataclass, field
from typing import Any, Protocol

from ..contracts import Finding
from ..trace import get_logger
from .schemas import LLMVerdict

log = get_logger(__name__)

_SEV_RANK = {"high": 0, "medium": 1, "low": 2, "info": 3}

# Checks safe to narrate without an LLM (structured evidence only).
_TEMPLATE_CHECKS = frozenset(
    {
        "fixed_offset",
        "cross_table_fixed_offset",
        "cross_table_repeated_values",
        "cross_table_matching_decimal_tails",
        "high_duplicate_rate",
        "multi_column_high_duplicate_rate",
        "improbable_repeated_values",
        "arithmetic_progression",
        "near_perfect_arithmetic_progression",
        "mirror_symmetry",
        "terminal_digit_concentration",
        "terminal_digit_pair_concentration",
        "cross_table_terminal_digit_concentration",
        "zero_variance",
        "zero_standard_deviation_entries",
        "constant_standard_deviation",
        "matching_decimal_tails",
        "integer_shift_decimal_tail_reuse",
        "integer_part_digit_change_decimal_tail_reuse",
        "ones_decimal_mirror",
        "three_column_additive_relationship",
        "three_column_subtractive_relationship",
        "highlight_inventory",
        "highlight_summary",
        "highlight_fixed_offset",
        "highlight_column_repeated_values",
        "highlight_column_zero_variance",
        "highlight_arithmetic_progression",
    }
)

# Only these structured patterns are clustered; unique titles stay 1:1
# so unit tests and rare findings are not incorrectly merged.
_CLUSTERABLE_CHECKS = _TEMPLATE_CHECKS | frozenset(
    {
        "sift_copy_move",
        "cross_image_sift",
        "panel_sift_match",
        "jpeg_ghost",
        "ela",
        "copy_move",
        "texture_overlap",
        "near_texture_overlap",
        "rotated_texture_overlap",
        "full_image_duplicate",
        "image_forensics_summary",
    }
)


class _EnrichClient(Protocol):
    name: str

    def analyze_finding(self, finding: Finding) -> LLMVerdict | None: ...

    def is_available(self) -> bool: ...


@dataclass
class Cluster:
    fingerprint: str
    members: list[Finding] = field(default_factory=list)

    @property
    def representative(self) -> Finding:
        # Prefer highest severity, then stable finding_id
        return sorted(
            self.members,
            key=lambda f: (
                _SEV_RANK.get(str(f.severity), 9),
                f.finding_id,
            ),
        )[0]


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off"}


def _parse_evidence(finding: Finding) -> dict[str, Any]:
    raw = finding.raw if isinstance(finding.raw, dict) else {}
    if raw:
        return raw
    ev = finding.evidence or ""
    if isinstance(ev, str) and ev.lstrip().startswith("{"):
        try:
            data = json.loads(ev)
            if isinstance(data, dict):
                return data
        except (ValueError, TypeError):
            pass
    return {}


def _check_of(finding: Finding) -> str:
    data = _parse_evidence(finding)
    for key in ("check", "kind", "backend_kind"):
        val = data.get(key)
        if val:
            return str(val)
    return ""


def _norm_loc(text: str) -> str:
    """Collapse digits so Fig.S1a / Fig.S2b share a family key when useful."""
    s = (text or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    # Keep letter panel suffixes; collapse long numbers
    s = re.sub(r"\d{2,}", "N", s)
    return s[:120]


def fingerprint(finding: Finding) -> str:
    """Cluster key. Unique per finding when not a known clusterable check."""
    check = _check_of(finding)
    det = finding.detector or ""
    sev = str(finding.severity)
    if check and (
        check in _CLUSTERABLE_CHECKS
        or det in {"table_relationships", "table_forensics", "table_highlight_focus"}
    ):
        loc = _norm_loc(finding.location or "")
        # Title pattern without specific cell indices
        title = re.sub(r"\d+", "N", (finding.title or "").lower())[:100]
        return f"{det}|{check}|{sev}|{loc}|{title}"
    # Rare / unstructured: never merge
    return f"unique:{finding.finding_id}"


def _template_verdict(finding: Finding) -> LLMVerdict | None:
    if not _env_flag("MANUSIFT_LLM_TEMPLATE_CHECKS", True):
        return None
    data = _parse_evidence(finding)
    check = _check_of(finding)
    if check not in _TEMPLATE_CHECKS:
        # also allow raw.kind for highlight_*
        kind = str(data.get("kind") or "")
        if kind not in _TEMPLATE_CHECKS:
            return None
        check = kind

    loc = finding.location or "unknown location"
    n = data.get("n") or data.get("match_count") or data.get("n_highlighted")
    offset = data.get("offset")
    step = data.get("step")
    left = data.get("left_column") or data.get("left_table")
    right = data.get("right_column") or data.get("right_table")
    col = data.get("column") or data.get("header")

    if check in {"fixed_offset", "cross_table_fixed_offset", "highlight_fixed_offset"}:
        pair = f"'{left}' vs '{right}'" if left and right else "two numeric series"
        summary = (
            f"At {loc}, {pair} show a fixed numeric offset"
            + (f" of {offset}" if offset is not None else "")
            + (f" across n={n} rows" if n else "")
            + ". Perfect constant offsets are uncommon in independent experimental replicates."
        )
        verdict = "suspicious" if str(finding.severity) == "high" else "needs_review"
    elif check in {
        "cross_table_repeated_values",
        "high_duplicate_rate",
        "multi_column_high_duplicate_rate",
        "improbable_repeated_values",
        "highlight_column_repeated_values",
    }:
        summary = (
            f"At {loc}, values are repeated at an improbable rate"
            + (f" (n={n})" if n else "")
            + ". Review whether rows/columns were copied or relabelled."
        )
        verdict = "suspicious" if str(finding.severity) == "high" else "needs_review"
    elif check in {
        "arithmetic_progression",
        "near_perfect_arithmetic_progression",
        "highlight_arithmetic_progression",
    }:
        summary = (
            f"At {loc}, a numeric series forms "
            + ("an exact" if check == "arithmetic_progression" else "a near-perfect")
            + " arithmetic progression"
            + (f" (step={step})" if step is not None else "")
            + ". Synthetic sequences often lack natural measurement noise."
        )
        verdict = "needs_review"
    elif check in {
        "terminal_digit_concentration",
        "terminal_digit_pair_concentration",
        "cross_table_terminal_digit_concentration",
    }:
        top = data.get("top_digits")
        summary = (
            f"At {loc}, terminal digits are abnormally concentrated"
            + (f" (top={top})" if top else "")
            + ". Real continuous measurements usually show more uniform last digits."
        )
        verdict = "needs_review"
    elif check in {
        "zero_variance",
        "zero_standard_deviation_entries",
        "constant_standard_deviation",
        "highlight_column_zero_variance",
    }:
        summary = (
            f"At {loc}, variability is zero or constant across reported values. "
            "Confirm whether SD/SEM was omitted, rounded, or fabricated."
        )
        verdict = "suspicious" if str(finding.severity) == "high" else "needs_review"
    elif check == "mirror_symmetry":
        summary = (
            f"At {loc}, two columns sum to a constant (mirror symmetry). "
            "Verify whether one series was derived by reflection rather than measured."
        )
        verdict = "needs_review"
    elif check in {
        "matching_decimal_tails",
        "cross_table_matching_decimal_tails",
        "integer_shift_decimal_tail_reuse",
        "integer_part_digit_change_decimal_tail_reuse",
        "ones_decimal_mirror",
    }:
        summary = (
            f"At {loc}, decimal tails (or ones/decimal digits) match across series "
            "more often than expected for independent measurements."
        )
        verdict = "needs_review"
    elif check in {
        "three_column_additive_relationship",
        "three_column_subtractive_relationship",
    }:
        formula = data.get("formula") or "A ± B = C"
        summary = (
            f"At {loc}, columns satisfy a perfect arithmetic identity ({formula}) "
            "with no residual. Confirm this is an intentional derived column."
        )
        verdict = "needs_review"
    elif check in {"highlight_inventory", "highlight_summary"}:
        summary = (
            f"Spreadsheet cells are author/editor-highlighted at {loc}"
            + (f" (n={n})" if n else "")
            + ". Prioritise these marked cells when reviewing source data."
        )
        verdict = "needs_review"
    else:
        return None

    conf = 0.75 if verdict == "suspicious" else 0.6
    return LLMVerdict(
        summary=summary[:500],
        verdict=verdict,  # type: ignore[arg-type]
        confidence=conf,
        next_step="Open the cited table/figure and verify against source data files.",
    )


def _apply_verdict(
    finding: Finding,
    verdict: LLMVerdict | None,
    *,
    source: str,
    shared_from: str | None = None,
    cluster_size: int = 1,
) -> None:
    if verdict is None:
        object.__setattr__(finding, "llm_skipped", True)
        return
    summary = verdict.summary
    if cluster_size > 1 and shared_from and finding.finding_id != shared_from:
        summary = (
            f"{summary} "
            f"[shared with {cluster_size - 1} similar finding(s); "
            f"rep={shared_from}]"
        )
        if len(summary) > 500:
            summary = summary[:497] + "..."
    object.__setattr__(finding, "llm_verdict", summary)
    object.__setattr__(finding, "llm_skipped", False)
    # Optional audit fields (frozen dataclass — setattr like llm_verdict)
    try:
        object.__setattr__(finding, "llm_source", source)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass


def build_clusters(findings: list[Finding]) -> list[Cluster]:
    buckets: dict[str, Cluster] = {}
    for f in findings:
        fp = fingerprint(f)
        cl = buckets.get(fp)
        if cl is None:
            cl = Cluster(fingerprint=fp)
            buckets[fp] = cl
        cl.members.append(f)
    # high clusters first, then larger clusters
    return sorted(
        buckets.values(),
        key=lambda c: (
            _SEV_RANK.get(str(c.representative.severity), 9),
            -len(c.members),
            c.fingerprint,
        ),
    )


def _chunk(items: list[Any], size: int) -> list[list[Any]]:
    if size <= 0:
        size = 12
    return [items[i : i + size] for i in range(0, len(items), size)]


def _batch_prompt(items: list[tuple[str, Finding]]) -> str:
    rows = []
    for fid, f in items:
        data = _parse_evidence(f)
        check = _check_of(f) or data.get("kind") or ""
        rows.append(
            {
                "id": fid,
                "detector": f.detector,
                "severity": f.severity,
                "title": (f.title or "")[:160],
                "location": (f.location or "")[:120],
                "check": check,
                "evidence": (f.evidence or "")[:400],
            }
        )
    return (
        "You are a research-integrity reviewer. For EACH item below, "
        "return one JSON object with keys: "
        'id, summary, verdict ("looks_legit"|"suspicious"|"needs_review"), '
        "confidence (0..1), next_step. "
        "Respond with a single JSON array only (no markdown).\n\n"
        f"ITEMS:\n{json.dumps(rows, ensure_ascii=False, indent=2)}"
    )


def _parse_batch_response(
    raw: str | None,
    expected_ids: list[str],
) -> dict[str, LLMVerdict]:
    from .client.providers import _coerce_verdict_payload, _extract_json_object

    if not raw:
        return {}
    # Prefer array extraction
    text = raw.strip()
    arr = None
    try:
        obj = json.loads(text)
        if isinstance(obj, list):
            arr = obj
        elif isinstance(obj, dict) and isinstance(obj.get("results"), list):
            arr = obj["results"]
    except (ValueError, TypeError):
        pass
    if arr is None:
        # try slice between first [ and last ]
        a, b = text.find("["), text.rfind("]")
        if a >= 0 and b > a:
            try:
                cand = json.loads(text[a : b + 1])
                if isinstance(cand, list):
                    arr = cand
            except (ValueError, TypeError):
                pass
    if not isinstance(arr, list):
        # single object fallback
        one = _extract_json_object(raw)
        if one and expected_ids:
            try:
                v = LLMVerdict.model_validate(_coerce_verdict_payload(one))
                return {expected_ids[0]: v}
            except Exception:  # noqa: BLE001
                return {}
        return {}

    out: dict[str, LLMVerdict] = {}
    for i, item in enumerate(arr):
        if not isinstance(item, dict):
            continue
        fid = str(item.get("id") or "")
        if not fid and i < len(expected_ids):
            fid = expected_ids[i]
        if not fid:
            continue
        try:
            out[fid] = LLMVerdict.model_validate(_coerce_verdict_payload(item))
        except Exception:  # noqa: BLE001
            continue
    return out


def _call_batch_http(
    client: Any,
    items: list[tuple[str, Finding]],
    *,
    strict_json: bool = False,
) -> dict[str, LLMVerdict]:
    """Provider-agnostic batch via raw messages HTTP when possible."""
    expected = [fid for fid, _ in items]
    # Single-item batches use analyze_finding so provider _call patches
    # (unit tests) and retry-on-garbage paths stay intact.
    if len(items) == 1:
        fid, f = items[0]
        try:
            v = client.analyze_finding(f)
            return {fid: v} if v is not None else {}
        except Exception:  # noqa: BLE001
            return {}

    prompt = _batch_prompt(items)
    if strict_json:
        prompt += "\nOutput ONLY a JSON array. No prose."

    # Prefer a dedicated method if present
    if hasattr(client, "analyze_findings_batch"):
        try:
            result = client.analyze_findings_batch(
                [f for _, f in items],
                ids=expected,
            )
            if isinstance(result, dict):
                return result  # type: ignore[return-value]
            if isinstance(result, list) and len(result) == len(items):
                return {
                    expected[i]: result[i]
                    for i in range(len(items))
                    if result[i] is not None
                }
        except Exception as exc:  # noqa: BLE001
            log.debug("analyze_findings_batch failed: %s", exc)

    # Fallback: single multi-finding prompt through analyze_finding path's _call
    if hasattr(client, "_call_raw_prompt"):
        try:
            raw = client._call_raw_prompt(prompt, max_tokens=2000)
            return _parse_batch_response(raw, expected)
        except Exception as exc:  # noqa: BLE001
            log.debug("batch raw prompt failed: %s", exc)

    # Last resort: parallel per-item analyze_finding (test clients / no batch API)
    out: dict[str, LLMVerdict] = {}
    workers = min(8, max(1, len(items)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {
            pool.submit(client.analyze_finding, f): fid for fid, f in items
        }
        for fut, fid in futs.items():
            try:
                v = fut.result()
                if v is not None:
                    out[fid] = v
            except Exception:  # noqa: BLE001
                continue
    return out


def enrich_findings(
    findings: list[Finding],
    client: _EnrichClient,
    *,
    max_concurrency: int,
    budget_seconds: float,
    per_call_timeout: float,
) -> int:
    """Enrich high/medium findings. Returns number of LLM API units (batches or calls)."""
    mode = (
        os.environ.get("MANUSIFT_LLM_ENRICH_MODE", "cluster_batch")
        .strip()
        .lower()
        or "cluster_batch"
    )
    if mode in {"off", "none", "0"}:
        for f in findings:
            if f.severity in ("medium", "high"):
                object.__setattr__(f, "llm_skipped", True)
        return 0

    if getattr(client, "name", "") == "mock":
        return 0
    if max_concurrency <= 0:
        for f in findings:
            if f.severity in ("medium", "high"):
                object.__setattr__(f, "llm_skipped", True)
        return 0

    targets = [f for f in findings if f.severity in ("medium", "high")]
    if not targets:
        return 0

    # ---- legacy cap mode ----
    if mode == "cap":
        return _enrich_cap(
            targets,
            client,
            max_concurrency=max_concurrency,
            budget_seconds=budget_seconds,
            per_call_timeout=per_call_timeout,
        )

    # ---- cluster_batch (default) ----
    # 1) templates
    need_llm: list[Finding] = []
    for f in targets:
        tv = _template_verdict(f)
        if tv is not None:
            _apply_verdict(f, tv, source="template")
        else:
            need_llm.append(f)

    if not need_llm:
        return 0

    clusters = build_clusters(need_llm)
    max_clusters = _env_int("MANUSIFT_LLM_ENRICH_MAX", 200)
    if max_clusters < 0:
        max_clusters = 0
    if max_clusters > 0:
        overflow = clusters[max_clusters:]
        clusters = clusters[:max_clusters]
        for cl in overflow:
            for f in cl.members:
                object.__setattr__(f, "llm_skipped", True)

    batch_size = max(1, min(32, _env_int("MANUSIFT_LLM_BATCH_SIZE", 12)))
    # Prepare work items: one Finding rep per cluster
    work: list[tuple[Cluster, Finding]] = [
        (cl, cl.representative) for cl in clusters
    ]

    deadline = time.time() + float(budget_seconds)
    calls = 0

    # Batch chunks
    batches = _chunk(work, batch_size)
    # Run batches with limited concurrency (each batch = 1 API call)
    def run_batch(
        batch: list[tuple[Cluster, Finding]],
    ) -> tuple[list[tuple[Cluster, Finding]], dict[str, LLMVerdict]]:
        items = [(cl.representative.finding_id, rep) for cl, rep in batch]
        verdicts = _call_batch_http(client, items)
        # retry missing once with strict
        missing = [it for it in items if it[0] not in verdicts]
        if missing:
            v2 = _call_batch_http(client, missing, strict_json=True)
            verdicts.update(v2)
        return batch, verdicts

    pending_batches: list[list[tuple[Cluster, Finding]]] = []
    for batch in batches:
        if time.time() >= deadline:
            for cl, _rep in batch:
                for f in cl.members:
                    object.__setattr__(f, "llm_skipped", True)
            continue
        pending_batches.append(batch)

    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        futs = [pool.submit(run_batch, b) for b in pending_batches]
        calls = len(futs)
        for fut in futs:
            remaining = deadline - time.time()
            if remaining <= 0:
                try:
                    fut.cancel()
                except Exception:  # noqa: BLE001
                    pass
                continue
            try:
                batch, verdicts = fut.result(
                    timeout=min(remaining, max(per_call_timeout, 30.0))
                )
            except FutTimeout:
                log.warning("llm batch enrichment timed out")
                continue
            except Exception as exc:  # noqa: BLE001
                log.warning("llm batch enrichment crashed", extra={"err": str(exc)})
                continue
            for cl, rep in batch:
                v = verdicts.get(rep.finding_id)
                if v is None:
                    # fallback single
                    try:
                        if time.time() < deadline:
                            v = client.analyze_finding(rep)
                            calls += 1
                    except Exception:  # noqa: BLE001
                        v = None
                for f in cl.members:
                    _apply_verdict(
                        f,
                        v,
                        source="cluster_batch" if v else "failed",
                        shared_from=rep.finding_id,
                        cluster_size=len(cl.members),
                    )
                    if v is None:
                        object.__setattr__(f, "llm_skipped", True)

    return calls


def _enrich_cap(
    targets: list[Finding],
    client: _EnrichClient,
    *,
    max_concurrency: int,
    budget_seconds: float,
    per_call_timeout: float,
) -> int:
    """Legacy 1:1 enrichment with hard max."""
    targets = sorted(
        targets,
        key=lambda f: (
            _SEV_RANK.get(str(f.severity), 9),
            str(f.detector or ""),
        ),
    )
    max_enrich = _env_int("MANUSIFT_LLM_ENRICH_MAX", 48)
    if max_enrich <= 0:
        max_enrich = 48
    max_enrich = max(1, min(500, max_enrich))
    run_list = targets[:max_enrich]
    for f in targets[max_enrich:]:
        object.__setattr__(f, "llm_skipped", True)

    deadline = time.time() + float(budget_seconds)
    futures: dict[Any, Finding] = {}
    calls = 0
    with ThreadPoolExecutor(max_workers=max_concurrency) as pool:
        for f in run_list:
            if time.time() >= deadline:
                object.__setattr__(f, "llm_skipped", True)
                continue
            futures[pool.submit(client.analyze_finding, f)] = f
            calls += 1
        for fut, f in list(futures.items()):
            remaining = deadline - time.time()
            if remaining <= 0:
                fut.cancel()
                object.__setattr__(f, "llm_skipped", True)
                continue
            try:
                verdict = fut.result(timeout=min(remaining, per_call_timeout))
            except FutTimeout:
                object.__setattr__(f, "llm_skipped", True)
                continue
            except Exception:  # noqa: BLE001
                object.__setattr__(f, "llm_skipped", True)
                continue
            _apply_verdict(f, verdict, source="cap")
    return calls
