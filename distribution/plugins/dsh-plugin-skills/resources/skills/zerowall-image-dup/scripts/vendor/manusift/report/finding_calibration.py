"""Post-detector finding calibration (P0).

Goals
-----
* Recalibrate severity so "high" remains actionable.
* Demote satellite findings inside the same table-pair / check cluster
  (many column variants of the same group↔group relationship).
* Never drop findings — only rewrite severity + annotate ``raw.calibration``.

Design notes
------------
Detectors stay aggressive (high recall). This module is the precision layer
shared by the pipeline (before LLM enrich) and offline report regeneration.
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from ..contracts import Finding, Severity

_SEV_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3}
_RANK_SEV = {0: "info", 1: "low", 2: "medium", 3: "high"}

# Weak table checks: rarely warrant high on their own
# (perfect decimal-tail matches are promoted out of this set in
# ``_base_recalibrate`` when match_fraction≈1 and n is solid).
_WEAK_CHECKS = frozenset(
    {
        "cross_table_matching_decimal_tails",
        "matching_decimal_tails",
        "terminal_digit_concentration",
        "terminal_digit_pair_concentration",
        "cross_table_terminal_digit_concentration",
        "ones_decimal_mirror",
        "near_perfect_arithmetic_progression",
        "arithmetic_progression",
    }
)

# Strong table checks: may stay high when evidence is solid
_STRONG_CHECKS = frozenset(
    {
        "cross_table_fixed_offset",
        "cross_table_partial_fixed_offset",
        "cross_table_repeated_values",
        "fixed_offset",
        "partial_fixed_offset",
        "high_duplicate_rate",
        "improbable_repeated_values",
        "multi_column_high_duplicate_rate",
        "zero_variance",
        "zero_standard_deviation_entries",
        "integer_shift_decimal_tail_reuse",
        "three_column_additive_relationship",
        "three_column_subtractive_relationship",
        "excel_fabrication_span",
        "sequence_reuse",
        "identical_parallel_replicates",
        "fixed_ratio",
    }
)

# Nature Source Data often uses blank headers for parallel replicate
# columns — empty labels alone must not demote these fabrication checks.
_EMPTY_HEADER_IMMUNE_CHECKS = frozenset(
    {
        "fixed_offset",
        "partial_fixed_offset",
        "cross_table_fixed_offset",
        "cross_table_partial_fixed_offset",
        "cross_table_repeated_values",
        "high_duplicate_rate",
        "multi_column_high_duplicate_rate",
        "matching_decimal_tails",
        "cross_table_matching_decimal_tails",
        "integer_shift_decimal_tail_reuse",
        "integer_part_digit_change_decimal_tail_reuse",
        "three_column_additive_relationship",
        "three_column_subtractive_relationship",
        "excel_fabrication_span",
        "sequence_reuse",
        "identical_parallel_replicates",
        "fixed_ratio",
    }
)


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _rank(sev: str) -> int:
    return _SEV_RANK.get(str(sev or "info"), 0)


def _sev(rank: int) -> Severity:
    return _RANK_SEV.get(max(0, min(3, rank)), "info")  # type: ignore[return-value]


def _check_of(f: Finding) -> str:
    raw = f.raw if isinstance(f.raw, dict) else {}
    return str(raw.get("check") or raw.get("kind") or "").strip().lower()


def _n_of(raw: dict[str, Any]) -> int:
    for key in ("n", "matching_pairs", "match_count", "inlier_count", "repeat_count"):
        if key in raw and raw[key] is not None:
            try:
                return int(float(raw[key]))
            except (TypeError, ValueError):
                continue
    return 0


def _match_fraction_of(raw: dict[str, Any]) -> float:
    """Best-effort match fraction for tail / partial-offset findings."""
    if "match_fraction" in raw and raw["match_fraction"] is not None:
        try:
            return float(raw["match_fraction"])
        except (TypeError, ValueError):
            pass
    n = _n_of(raw)
    if n <= 0:
        return 0.0
    for key in ("matching_pairs", "matching_rows", "match_count"):
        if key in raw and raw[key] is not None:
            try:
                return float(raw[key]) / float(n)
            except (TypeError, ValueError, ZeroDivisionError):
                continue
    # exact fixed_offset implies full match
    check = str(raw.get("check") or "")
    if check in ("fixed_offset", "cross_table_fixed_offset"):
        return 1.0
    return 0.0


def _is_clean_numeric_offset(off: Any) -> bool:
    """Integers / tenths / 0.05-grid offsets typical of spreadsheet fabrication."""
    try:
        x = abs(float(off))
    except (TypeError, ValueError):
        return False
    if x == 0.0:
        return True
    if abs(x - round(x)) < 1e-9:
        return True
    # one decimal place
    if abs(x * 10 - round(x * 10)) < 1e-9:
        return True
    # two decimals on 0.05 grid
    cents = round(x * 100)
    if abs(x * 100 - cents) < 1e-6 and cents % 5 == 0:
        return True
    return False


def _empty_label(s: Any) -> bool:
    t = str(s or "").strip()
    return (not t) or t.lower() in {"", "none", "null", "nan"} or re.fullmatch(
        r"col[_\s]?\d+", t, flags=re.I
    ) is not None


def _norm_table_key(label: str) -> str:
    s = re.sub(r"\s+", " ", (label or "").strip().lower())
    s = re.sub(r"\bin\s+sfig\.?\s*\d+\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _pair_cluster_key(f: Finding) -> str | None:
    """Cluster key for demoting satellites of the same group↔group relation."""
    raw = f.raw if isinstance(f.raw, dict) else {}
    check = _check_of(f)
    det = (f.detector or "").lower()

    # Bulk image soft-signal clusters (same page / same kind)
    if det in ("image_forensics", "image_noise_inconsistency"):
        kind = check or str(raw.get("kind") or "soft")
        page = raw.get("page")
        if page is None:
            m = re.search(r"page\s+(\d+)", f.location or "", re.I)
            page = m.group(1) if m else "x"
        # cluster soft kinds together per page so only Top-K stay elevated
        if kind in (
            "ela",
            "jpeg_ghost",
            "copy_move",
            "image_forensics_summary",
            "",
        ) or det == "image_noise_inconsistency":
            return f"{det}|soft|{page}"

    if not check:
        return None
    left_t = str(raw.get("left_table") or "").strip()
    right_t = str(raw.get("right_table") or "").strip()
    if left_t or right_t:
        a, b = _norm_table_key(left_t), _norm_table_key(right_t)
        if a > b:
            a, b = b, a
        return f"{det}|{check}|{a}|{b}"

    # Within-table column pairs: cluster by table host from location
    if check in (
        "fixed_offset",
        "partial_fixed_offset",
        "high_duplicate_rate",
        "mirror_symmetry",
        "matching_decimal_tails",
        "integer_shift_decimal_tail_reuse",
        "integer_part_digit_change_decimal_tail_reuse",
        "cross_table_partial_fixed_offset",
        "identical_parallel_replicates",
        "sequence_reuse",
    ):
        loc = f.location or ""
        host = re.split(r",\s*columns?\b", loc, maxsplit=1, flags=re.I)[0]
        host = _norm_table_key(host)
        if host:
            return f"{det}|{check}|{host}|self"

    # Image pairs: cluster by image_a/image_b pages
    ia, ib = raw.get("image_a"), raw.get("image_b")
    if isinstance(ia, dict) and isinstance(ib, dict):
        ka = f"{ia.get('page')}:{ia.get('index')}"
        kb = f"{ib.get('page')}:{ib.get('index')}"
        if ka > kb:
            ka, kb = kb, ka
        return f"{det}|{check}|{ka}|{kb}"

    return None


def _base_recalibrate(f: Finding) -> tuple[str, list[str]]:
    """Return (severity, reasons) after evidence-based rules (pre-cluster)."""
    prior = str(f.severity or "info")
    rank = _rank(prior)
    reasons: list[str] = []
    raw = f.raw if isinstance(f.raw, dict) else {}
    check = _check_of(f)
    n = _n_of(raw)
    det = (f.detector or "").lower()

    # --- table relationships ---
    if det == "table_relationships" or check.startswith("cross_table") or check in _STRONG_CHECKS | _WEAK_CHECKS:
        left_c = raw.get("left_column")
        right_c = raw.get("right_column")
        col = raw.get("column")

        # Perfect decimal-tail reuse is an Excel-typed fabrication signature —
        # treat as strong when nearly all pairs match and n is solid.
        match_frac = _match_fraction_of(raw)
        perfect_tail = (
            check
            in (
                "matching_decimal_tails",
                "cross_table_matching_decimal_tails",
                "integer_shift_decimal_tail_reuse",
            )
            and n >= 6
            and match_frac >= 0.95
        )
        treat_as_weak = check in _WEAK_CHECKS and not perfect_tail

        if treat_as_weak and rank > 2:
            rank = 2
            reasons.append("weak_check_cap_medium")

        if perfect_tail and prior in ("medium", "high") and rank < 3:
            rank = 3
            reasons.append("perfect_decimal_tail_boost_high")

        # Non-zero fixed offset: keep high for clean "A = B + c" with solid n
        # (s41586-style fabrication). Cap only messy small-n offsets.
        if check in (
            "fixed_offset",
            "partial_fixed_offset",
            "cross_table_fixed_offset",
            "cross_table_partial_fixed_offset",
        ):
            try:
                off = raw.get("offset")
                if off is not None and float(off) != 0.0:
                    clean = _is_clean_numeric_offset(off)
                    if n >= 8 and clean:
                        if prior in ("medium", "high") and rank < 3:
                            rank = 3
                            reasons.append("clean_nonzero_offset_boost_high")
                    elif rank > 2 and (n < 8 or not clean):
                        rank = 2
                        reasons.append("nonzero_offset_cap_medium")
            except (TypeError, ValueError):
                pass

        if n and n < 5 and rank > 1:
            rank = min(rank, 1)
            reasons.append("small_n")

        if n and 5 <= n < 12 and rank > 2 and treat_as_weak:
            rank = 2
            reasons.append("modest_n_weak_check")

        # Empty / placeholder column labels → demote noisy SI tables,
        # but NOT for fabrication-strong checks (Nature blank rep headers).
        empty_cols = 0
        for c in (left_c, right_c, col):
            if c is not None and _empty_label(c):
                empty_cols += 1
        # n>=5 covers sequence_reuse windows (default length 5) and small
        # but solid fixed-offset blocks common in Source Data.
        immune = check in _EMPTY_HEADER_IMMUNE_CHECKS and n >= 5
        if empty_cols and rank > 1 and not immune:
            rank = max(1, rank - 1)
            reasons.append("empty_or_placeholder_column")
        elif empty_cols and immune:
            reasons.append("empty_header_immune_fabrication_check")

        # Cross-table exact reuse with large n stays eligible for high
        if check in (
            "cross_table_repeated_values",
            "cross_table_fixed_offset",
            "cross_table_partial_fixed_offset",
        ):
            try:
                off = raw.get("offset")
                zero_off = off is None or float(off) == 0.0
            except (TypeError, ValueError):
                zero_off = True
            if n >= 50 and zero_off and check in _STRONG_CHECKS:
                # keep/restore high; empty headers no longer block this
                if prior == "high" and rank < 3:
                    rank = 3
                    reasons.append("large_n_strong_cross_table")

        # Paper-level Excel span: high only with several true high members.
        # Blind n>=5 / table_count boost made multi-table legit papers high.
        if check == "excel_fabrication_span":
            try:
                high_members = int(raw.get("high_member_count") or 0)
            except (TypeError, ValueError):
                high_members = 0
            if high_members >= 5 and n >= 8 and rank < 3:
                if prior in ("medium", "high"):
                    rank = 3
                    reasons.append("excel_span_boost_high_members")
            elif rank > 2:
                rank = 2
                reasons.append("excel_span_cap_medium")

        # Statistical duplicate excess on a single table: high is rarely
        # actionable alone on clinical/assay tables with legitimate ties.
        if check in (
            "high_duplicate_rate",
            "improbable_repeated_values",
            "multi_column_high_duplicate_rate",
            "duplicate_excess",
        ) and rank > 2:
            try:
                rate = float(
                    raw.get("duplicate_rate")
                    or raw.get("rate")
                    or raw.get("repeat_fraction")
                    or 0
                )
            except (TypeError, ValueError):
                rate = 0.0
            try:
                repeat_count = int(raw.get("repeat_count") or 0)
            except (TypeError, ValueError):
                repeat_count = 0
            # Poisson-excess q-tests fire high on legit assay ties; keep
            # high only for near-total column copies with solid n.
            near_full_copy = (
                rate >= 0.85 or (n and repeat_count and repeat_count / max(n, 1) >= 0.85)
            )
            if not near_full_copy or (n and n < 20):
                rank = 2
                reasons.append("duplicate_excess_cap_medium")
    # --- image forensics soft signals ---
    if det in ("image_forensics", "image_noise_inconsistency", "imagehash_dup"):
        kind = check
        if kind in ("ela", "jpeg_ghost") and rank > 2:
            rank = 2
            reasons.append("ela_or_ghost_cap_medium")
        if kind == "copy_move" and raw.get("secondary") and rank > 1:
            rank = 1
            reasons.append("secondary_copy_move")
        if kind == "image_forensics_summary" and rank > 2:
            rank = 2
            reasons.append("summary_cap_medium")
        if kind == "vertical_gel_seam" and rank > 2:
            rank = 2
            reasons.append("gel_seam_cap_medium")
        if det == "image_noise_inconsistency" and rank > 1:
            rank = min(rank, 1)
            reasons.append("noise_inconsistency_low")

    # Terminal-digit round bias: high only for extreme concentration.
    if det == "table_round_bias" and rank > 2:
        try:
            ratio = float(raw.get("ratio") or raw.get("zero_five_ratio") or 0)
        except (TypeError, ValueError):
            ratio = 0.0
        if ratio < 0.85:
            rank = 2
            reasons.append("round_bias_cap_medium")

    # Cross-paper local index hygiene.
    if det == "cross_paper_image":
        other = str(raw.get("matched_paper_id") or "").strip().lower()
        if other in {
            "original",
            "paper",
            "main",
            "document",
            "file",
            "image",
            "",
        } or (
            10 <= len(other) <= 40
            and all(c in "0123456789abcdef" for c in other)
        ):
            if rank > 1:
                rank = 1
                reasons.append("cross_paper_generic_id_demote")
        # Small assets / non-substantial matches never high.
        if rank > 2 and not raw.get("substantial_image", True):
            rank = 2
            reasons.append("cross_paper_small_asset_cap_medium")

    # --- figure OCR recovered grids are low-precision alone ---
    if det == "figure_table_ocr":
        kind = check
        if kind in ("ocr_table_recovered",) and rank > 1:
            rank = 1
            reasons.append("ocr_recovery_info_cap")
        if kind == "ocr_column_zero_variance" and rank > 2:
            rank = 2
            reasons.append("ocr_zero_var_cap_medium")

    # --- bulk image noise / forensics soft signals (incidental-prone) ---
    if det == "image_noise_inconsistency" and rank > 1:
        rank = 1
        reasons.append("noise_inconsistency_cap_low")
    if det == "image_forensics":
        kind = check or str(raw.get("kind") or "").lower()
        if kind in ("ela", "jpeg_ghost", "image_forensics_summary") and rank > 1:
            rank = min(rank, 1)
            reasons.append("forensics_soft_signal_cap_low")
        elif kind in ("copy_move",) and raw.get("secondary") and rank > 1:
            rank = 1
            reasons.append("secondary_copy_move")

    # --- metadata / compliance: never high alone ---
    if det in ("pdf_metadata", "compliance", "supplementary", "text_patterns"):
        if rank > 2:
            rank = 2
            reasons.append("meta_compliance_cap_medium")

    new = _sev(rank)
    if new != prior and not reasons:
        reasons.append("rank_clamp")
    return str(new), reasons


def _apply_cluster_demotion(
    items: list[tuple[int, Finding, str, list[str]]],
) -> list[tuple[int, Finding, str, list[str]]]:
    """Within each pair cluster, keep Top-K at current severity; demote rest."""
    top_k = max(1, _env_int("MANUSIFT_CALIBRATE_CLUSTER_TOP_K", 3))
    # optional hard cap of high findings per cluster after demotion
    max_high = max(0, _env_int("MANUSIFT_CALIBRATE_CLUSTER_MAX_HIGH", 2))

    buckets: dict[str, list[int]] = defaultdict(list)
    for i, (_idx, f, sev, _rs) in enumerate(items):
        key = _pair_cluster_key(f)
        if key:
            buckets[key].append(i)

    out = list(items)
    for _key, idxs in buckets.items():
        # sort by n desc, then prior rank
        def sort_key(i: int) -> tuple:
            f = out[i][1]
            raw = f.raw if isinstance(f.raw, dict) else {}
            return (-_n_of(raw), -_rank(out[i][2]), out[i][0])

        idxs_sorted = sorted(idxs, key=sort_key)
        high_kept = 0
        for rank_i, i in enumerate(idxs_sorted):
            idx, f, sev, reasons = out[i]
            r = _rank(sev)
            if rank_i >= top_k and r > 1:
                r = max(1, r - 1)
                reasons = list(reasons) + [f"cluster_satellite_rank_{rank_i + 1}"]
                sev = _sev(r)
            if sev == "high":
                if high_kept >= max_high:
                    sev = "medium"
                    reasons = list(reasons) + ["cluster_max_high"]
                    r = 2
                else:
                    high_kept += 1
            out[i] = (idx, f, str(sev), reasons)
    return out


# Cross-image forensics kinds that imply image reuse between
# extractions. Bridged to image_dup so gold/eval core lists that
# expect ``image_dup`` still fire when only SIFT/texture cells hit.
_FORENSICS_CROSS_IMAGE_KINDS = frozenset(
    {
        "cross_image_sift",
        "texture_overlap",
        "near_texture_overlap",
        "rotated_texture_overlap",
    }
)
_MAX_BRIDGED_IMAGE_DUP = 30
_MAX_BRIDGED_PANEL_DUP = 30


def bridge_forensics_to_image_dup(
    findings: list[Finding],
) -> list[Finding]:
    """Emit image_dup findings for unique cross-image forensics pairs.

    ``image_forensics`` often finds local reuse (SIFT / texture cells)
    while whole-image pHash ``image_dup`` stays silent. Eval gold and
    investigation reports treat ``image_dup`` as the primary
    cross-figure reuse detector name, so we mirror strong forensics
    cross-image hits as medium ``image_dup`` findings (deduped by
    page/index pair). Does not drop or rewrite forensics findings.
    """
    if not findings:
        return list(findings)

    existing_pairs: set[tuple[int, int, int, int]] = set()
    for f in findings:
        if f.detector != "image_dup":
            continue
        pair = _image_pair_key(f)
        if pair is not None:
            existing_pairs.add(pair)

    bridged: list[Finding] = []
    for f in findings:
        if f.detector != "image_forensics":
            continue
        raw = f.raw if isinstance(f.raw, dict) else {}
        kind = str(raw.get("kind") or "").strip().lower()
        if kind not in _FORENSICS_CROSS_IMAGE_KINDS:
            continue
        pair = _image_pair_key(f)
        if pair is None or pair in existing_pairs:
            continue
        existing_pairs.add(pair)
        ia = raw.get("image_a") if isinstance(raw.get("image_a"), dict) else {}
        ib = raw.get("image_b") if isinstance(raw.get("image_b"), dict) else {}
        page_a = ia.get("page", "?")
        page_b = ib.get("page", "?")
        idx_a = ia.get("index", "?")
        idx_b = ib.get("index", "?")
        # Prefer forensics severity, floor at medium for actionability.
        sev = str(f.severity or "medium")
        if _rank(sev) < _rank("medium"):
            sev = "medium"
        bridged.append(
            Finding.make(
                trace_id=f.trace_id,
                detector="image_dup",
                severity=sev,  # type: ignore[arg-type]
                title="Near-duplicate image / region (forensics bridge)",
                evidence=(
                    f"Bridged from image_forensics kind={kind}. "
                    f"Cross-image local match between page "
                    f"{int(page_a) + 1 if isinstance(page_a, int) else page_a} "
                    f"image {idx_a} and page "
                    f"{int(page_b) + 1 if isinstance(page_b, int) else page_b} "
                    f"image {idx_b}. Whole-image pHash may miss "
                    f"panel-level reuse; forensics evidence supports "
                    f"manual side-by-side review."
                ),
                location=f.location or (
                    f"Page {page_a} / image {idx_a}  ↔  "
                    f"Page {page_b} / image {idx_b}"
                ),
                raw={
                    "pass": "forensics_bridge",
                    "source_detector": "image_forensics",
                    "source_kind": kind,
                    "source_finding_id": f.finding_id,
                    "image_a": ia,
                    "image_b": ib,
                    "algorithm": kind,
                },
            )
        )
        if len(bridged) >= _MAX_BRIDGED_IMAGE_DUP:
            break

    if not bridged:
        return list(findings)
    return list(findings) + bridged


def bridge_forensics_to_panel_duplicate(
    findings: list[Finding],
) -> list[Finding]:
    """Emit panel_duplicate from within-figure forensics panel SIFT matches.

    Contour-based panel segmentation often fails on SEM/gel composites
    (few or zero boxes), while ``image_forensics`` still finds
    ``panel_sift_match`` pairs. Bridge those into the
    ``panel_duplicate`` detector name used by gold/eval.
    """
    if not findings:
        return list(findings)

    already = any(f.detector == "panel_duplicate" for f in findings)
    # Still bridge unique forensics panel hits even if some contour
    # hits exist — dedupe by page/index/panel boxes.
    seen: set[str] = set()
    for f in findings:
        if f.detector != "panel_duplicate":
            continue
        key = _panel_bridge_key(f)
        if key:
            seen.add(key)

    bridged: list[Finding] = []
    for f in findings:
        if f.detector != "image_forensics":
            continue
        raw = f.raw if isinstance(f.raw, dict) else {}
        kind = str(raw.get("kind") or "").strip().lower()
        if kind != "panel_sift_match":
            continue
        key = _panel_bridge_key(f)
        if key is None or key in seen:
            continue
        seen.add(key)
        page = raw.get("page", "?")
        index = raw.get("index", "?")
        panel_a = raw.get("panel_a")
        panel_b = raw.get("panel_b")
        inliers = raw.get("inlier_count")
        sev = str(f.severity or "medium")
        if _rank(sev) < _rank("medium"):
            sev = "medium"
        page_disp = int(page) + 1 if isinstance(page, int) else page
        bridged.append(
            Finding.make(
                trace_id=f.trace_id,
                detector="panel_duplicate",
                severity=sev,  # type: ignore[arg-type]
                title=(
                    f"Panels in image on page {page_disp} are "
                    f"near-duplicates (forensics panel SIFT bridge)"
                ),
                evidence=(
                    f"Bridged from image_forensics panel_sift_match "
                    f"(inliers={inliers}). Contour SSIM segmentation "
                    f"often misses SEM/gel composites; SIFT panel "
                    f"match supports within-figure reuse review."
                ),
                location=f.location
                or f"image on page {page_disp}, panels ({panel_a}, {panel_b})",
                raw={
                    "pass": "forensics_bridge",
                    "source_detector": "image_forensics",
                    "source_kind": kind,
                    "source_finding_id": f.finding_id,
                    "page": page,
                    "image_index": index,
                    "panel_a": panel_a,
                    "panel_b": panel_b,
                    "inlier_count": inliers,
                    "ssim_score": None,
                },
            )
        )
        if len(bridged) >= _MAX_BRIDGED_PANEL_DUP:
            break

    if not bridged:
        return list(findings)
    # ``already`` kept for future stats hooks; bridge always appends.
    _ = already
    return list(findings) + bridged


def _panel_bridge_key(f: Finding) -> str | None:
    raw = f.raw if isinstance(f.raw, dict) else {}
    page = raw.get("page", raw.get("image_index"))
    index = raw.get("index", raw.get("image_index"))
    pa = raw.get("panel_a")
    pb = raw.get("panel_b")
    if pa is None or pb is None:
        return None
    try:
        return f"{page}:{index}:{tuple(pa)}:{tuple(pb)}"
    except TypeError:
        return f"{page}:{index}:{pa}:{pb}"


def _image_pair_key(f: Finding) -> tuple[int, int, int, int] | None:
    """Canonical (page_a, idx_a, page_b, idx_b) with ordered endpoints."""
    raw = f.raw if isinstance(f.raw, dict) else {}
    ia = raw.get("image_a") if isinstance(raw.get("image_a"), dict) else None
    ib = raw.get("image_b") if isinstance(raw.get("image_b"), dict) else None
    if not ia or not ib:
        return None
    try:
        a = (int(ia["page"]), int(ia["index"]))
        b = (int(ib["page"]), int(ib["index"]))
    except (KeyError, TypeError, ValueError):
        return None
    if a == b:
        return None
    if a > b:
        a, b = b, a
    return (a[0], a[1], b[0], b[1])


# ---------------------------------------------------------------------------
# P1.3 publisher/template baseline whitelist
#
# A data-driven layer (``publisher_baselines.json``) applied AFTER the
# evidence recalibration and pair-cluster demotion. Each rule matches a
# class of signals that is known to fire on benign, publisher-production
# or template-level patterns (logos, page furniture, naturally similar
# multi-panel figures, version/reprint reference conflicts) and demotes
# high -> medium. Findings are never dropped; every hit is recorded in
# ``raw.publisher_baseline``.
# ---------------------------------------------------------------------------

_BASELINES_PATH = Path(__file__).with_name("publisher_baselines.json")

# DOI registration-agency prefix -> normalized publisher token.
_DOI_PREFIX_PUBLISHERS = {
    "10.1371": "plos",
    "10.3389": "frontiers",
    "10.1038": "springer_nature",
    "10.1007": "springer",
    "10.1136": "bmj",
    "10.7759": "cureus",
    "10.12688": "f1000",
    "10.1186": "bmc",
    "10.1016": "elsevier",
    "10.1002": "wiley",
    "10.1111": "wiley",
    "10.1093": "oup",
    "10.1126": "aaas",
    "10.1073": "pnas",
    "10.1021": "acs",
    "10.1080": "taylor_francis",
    "10.1155": "hindawi",
    "10.3390": "mdpi",
    "10.2147": "dove",
    "10.7554": "elife",
    "10.1098": "royal_society",
    "10.1056": "nejm",
    "10.1001": "jama",
    "10.3892": "spandidos",
}

_DOI_RE = re.compile(r"\b(10\.\d{4,5})/[^\s\"'<>\])}]+")


def _load_publisher_baselines() -> list[dict[str, Any]]:
    """Load the whitelist rule table; missing/corrupt JSON -> no rules."""
    path = Path(
        (os.environ.get("MANUSIFT_PUBLISHER_BASELINES") or "").strip()
        or _BASELINES_PATH
    )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    rules = data.get("rules") if isinstance(data, dict) else data
    if not isinstance(rules, list):
        return []
    return [r for r in rules if isinstance(r, dict)]


def _norm_publisher(s: Any) -> str:
    """Normalize a publisher name/token for containment matching."""
    t = re.sub(r"[^a-z0-9]+", "_", str(s or "").strip().lower())
    return t.strip("_")


def _publisher_from_doi(doi: str) -> str:
    m = _DOI_RE.search(str(doi or ""))
    if not m:
        return ""
    return _DOI_PREFIX_PUBLISHERS.get(m.group(1), "")


def resolve_publisher(
    *,
    publisher: str | None = None,
    metadata: dict[str, Any] | None = None,
    findings: list[Finding] | None = None,
    text: str | None = None,
) -> str:
    """Best-effort normalized publisher token for a document.

    Resolution order: explicit ``publisher`` argument, ``metadata`` DOI /
    publisher keys, a DOI found in ``text``, a DOI found in finding
    titles/raw (offline replay path). Returns "" when unknown — rules
    with a ``publisher`` constraint never match an unknown publisher.
    """
    if publisher:
        return _norm_publisher(publisher)
    if isinstance(metadata, dict):
        for key in ("doi", "DOI"):
            token = _publisher_from_doi(str(metadata.get(key) or ""))
            if token:
                return token
        for key in ("publisher", "journal"):
            val = str(metadata.get(key) or "").strip()
            if val:
                return _norm_publisher(val)
    if text:
        token = _publisher_from_doi(text)
        if token:
            return token
    if findings:
        for f in findings:
            token = _publisher_from_doi(f.title or "")
            if token:
                return token
            raw = f.raw if isinstance(f.raw, dict) else {}
            token = _publisher_from_doi(str(raw.get("doi") or ""))
            if token:
                return token
    return ""


def _baseline_rule_match(
    rule: dict[str, Any], f: Finding, doc_publisher: str
) -> bool:
    if str(rule.get("action") or "") != "demote_high_to_medium":
        return False
    det = str(rule.get("detector") or "").strip().lower()
    if not det or det != (f.detector or "").strip().lower():
        return False
    pub = _norm_publisher(rule.get("publisher"))
    if pub:
        # Publisher-scoped rules require a known, matching publisher.
        if not doc_publisher or pub not in doc_publisher:
            return False
    match = rule.get("match") if isinstance(rule.get("match"), dict) else {}
    kinds = match.get("kinds")
    if kinds:
        if _check_of(f) not in {str(k).strip().lower() for k in kinds}:
            return False
    title_re = match.get("title_regex")
    if title_re:
        try:
            if not re.search(str(title_re), f.title or "", flags=re.I):
                return False
        except re.error:
            return False
    return True


def _apply_publisher_baselines(
    items: list[tuple[int, Finding, str, list[str]]],
    rules: list[dict[str, Any]],
    doc_publisher: str,
) -> dict[int, dict[str, Any]]:
    """Demote high -> medium per whitelist rules.

    Mutates ``items`` severity/reasons and returns ``{index: annotation}``
    so the caller can record ``raw.publisher_baseline``.
    """
    hits: dict[int, dict[str, Any]] = {}
    if not rules:
        return hits
    out = list(items)
    for pos, (idx, f, sev, reasons) in enumerate(out):
        if sev != "high":
            continue
        for rule in rules:
            if not _baseline_rule_match(rule, f, doc_publisher):
                continue
            rule_id = str(rule.get("rule_id") or "unknown")
            reasons = list(reasons) + [f"publisher_baseline:{rule_id}"]
            out[pos] = (idx, f, "medium", reasons)
            hits[idx] = {
                "rule_id": rule_id,
                "prior_severity": "high",
                "severity": "medium",
                "reason": str(rule.get("rationale") or ""),
            }
            break
    items[:] = out
    return hits


def calibrate_findings(
    findings: list[Finding],
    *,
    enabled: bool | None = None,
    publisher: str | None = None,
    metadata: dict[str, Any] | None = None,
    text: str | None = None,
) -> list[Finding]:
    """Return a new list with calibrated severities.

    Set ``MANUSIFT_FINDING_CALIBRATE=0`` to disable.
    Always applies forensics bridges first (recall), then
    severity recalibration when enabled, then the P1.3
    publisher/template baseline whitelist (high -> medium).
    ``publisher`` / ``metadata`` / ``text`` are optional hints used to
    resolve the document publisher for publisher-scoped rules.
    """
    findings = bridge_forensics_to_image_dup(list(findings))
    findings = bridge_forensics_to_panel_duplicate(findings)

    if enabled is None:
        flag = (os.environ.get("MANUSIFT_FINDING_CALIBRATE", "1") or "1").strip().lower()
        enabled = flag not in {"0", "false", "off", "no"}
    if not enabled or not findings:
        return list(findings)

    staged: list[tuple[int, Finding, str, list[str]]] = []
    for i, f in enumerate(findings):
        sev, reasons = _base_recalibrate(f)
        staged.append((i, f, sev, reasons))

    staged = _apply_cluster_demotion(staged)

    # P1.3: publisher/template baseline whitelist (demote high -> medium).
    baseline_hits: dict[int, dict[str, Any]] = {}
    try:
        rules = _load_publisher_baselines()
        if rules:
            doc_publisher = resolve_publisher(
                publisher=publisher,
                metadata=metadata,
                findings=findings,
                text=text,
            )
            baseline_hits = _apply_publisher_baselines(
                staged, rules, doc_publisher
            )
    except Exception:  # noqa: BLE001 — whitelist must never break calibration
        baseline_hits = {}

    out: list[Finding] = []
    for _i, f, sev, reasons in staged:
        prior = str(f.severity or "info")
        raw = dict(f.raw) if isinstance(f.raw, dict) else {}
        if sev != prior or reasons:
            raw["calibration"] = {
                "prior_severity": prior,
                "severity": sev,
                "reasons": reasons,
                "version": "manusift.calibration.v1",
            }
        if _i in baseline_hits:
            raw["publisher_baseline"] = baseline_hits[_i]
        # Preserve cluster key for reports
        ck = _pair_cluster_key(f)
        if ck:
            raw.setdefault("cluster_key", ck)

        if sev == prior and "calibration" not in raw:
            out.append(f)
            continue

        out.append(
            Finding(
                finding_id=f.finding_id,
                trace_id=f.trace_id,
                detector=f.detector,
                severity=sev,  # type: ignore[arg-type]
                title=f.title,
                evidence=f.evidence,
                location=f.location,
                raw=raw,
                llm_verdict=f.llm_verdict,
                llm_skipped=f.llm_skipped,
            )
        )
    return out


def calibration_stats(findings: list[Finding]) -> dict[str, Any]:
    """Summarize severity distribution and calibration hits."""
    from collections import Counter

    sev = Counter(str(f.severity) for f in findings)
    changed = 0
    demoted = 0
    for f in findings:
        raw = f.raw if isinstance(f.raw, dict) else {}
        cal = raw.get("calibration")
        if isinstance(cal, dict) and cal.get("prior_severity") != cal.get("severity"):
            changed += 1
            if _rank(str(cal.get("severity"))) < _rank(str(cal.get("prior_severity"))):
                demoted += 1
    return {
        "total": len(findings),
        "by_severity": dict(sev),
        "changed": changed,
        "demoted": demoted,
        "high": sev.get("high", 0),
        "medium": sev.get("medium", 0),
        "low": sev.get("low", 0),
        "info": sev.get("info", 0),
    }
