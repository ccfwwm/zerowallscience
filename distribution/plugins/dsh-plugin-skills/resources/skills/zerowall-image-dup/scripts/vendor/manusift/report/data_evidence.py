"""Numerical / data-consistency explanation cards (R-2026-06-12).

The pre-existing
``stat_grim``,
``stat_percent``,
``stat_pvalue``,
``stat_consistency``,
and ``figure_grim``
detectors output a small
dictionary describing
the test that was run
and the values involved.
This module turns each
finding into a
``NumericalFinding``
with a human-readable
explanation.

R-2026-06-12: the user
spec is explicit that
the explanation must:

  * state the **test
    applied** (GRIM,
    percentage/sample-
    size consistency,
    p-value
    recomputation,
    etc.);
  * state the **input
    values** (the
    reported
    percentage, the
    sample size, the
    test statistic);
  * state the **expected
    constraint** (e.g.
    "k / n * 100 must
    round to 1 decimal
    for some integer
    k");
  * state the **observed
    value**;
  * state the **result
    category**
    (impossible /
    inconsistent /
    unusual / weak /
    not_testable);
  * state the **exact
    arithmetic** so a
    reviewer can verify
    it by hand.

We do NOT label a
finding as "constructed"
or "fabricated" -- the
spec explicitly forbids
that. The most we say
is "arithmetically
impossible under the
stated sample size"."""
from __future__ import annotations

from typing import Any

from .evidence import (
    Location,
    NumericalFinding,
    Severity,
    promote_severity,
)


def _safe_float(v: Any) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def explain_figure_grim(finding_dict: dict[str, Any]) -> NumericalFinding:
    """Turn a figure_grim finding into a NumericalFinding.

    R-2026-06-12: figure_grim
    fires when an OCR-
    detected percentage
    (e.g. "97%") with a
    candidate sample size
    n produces a non-
    integer implied count.
    The detector's raw
    fields are
    ``percentage``,
    ``n_used``, and
    ``implied_count``.
    The verdict is:
    "no integer k in
    [0, n] makes the
    percentage round to
    the reported value"."""

    pct = _safe_float(finding_dict.get("percentage"))
    # We
    # read
    # ``n_used``
    # before
    # coercing
    # to
    # float:
    # the
    # detector
    # sometimes
    # emits a
    # *list*
    # (the sweep
    # range
    # ``[3,
    # 100]``)
    # and we
    # want to
    # normalise
    # it to a
    # single
    # integer
    # rather
    # than
    # losing it
    # to
    # ``None``.
    n_raw = finding_dict.get("n_used")
    if isinstance(n_raw, list):
        n = int(n_raw[0]) if n_raw else None
    elif isinstance(n_raw, (int, float)) and n_raw is not None:
        n = int(n_raw)
    else:
        n = _safe_float(n_raw)
    implied = _safe_float(finding_dict.get("implied_count"))
    page = finding_dict.get("page")
    text = finding_dict.get("text", "")

    # The
    # GRIM
    # test
    # verdict.
    # We
    # have
    # to
    # check
    # whether
    # the
    # implied
    # count
    # is
    # close
    # enough
    # to
    # an
    # integer
    # to
    # be
    # consistent
    # with
    # rounding.
    impossible = False
    if implied is not None:
        # Within
        # +/-0.05
        # of
        # an
        # integer
        # is
        # consistent
        # (the
        # percentage
        # was
        # rounded
        # to
        # 1
        # decimal).
        round_diff = abs(implied - round(implied))
        impossible = round_diff > 0.05

    if impossible:
        result = "impossible"
        result_long = (
            f"With n = {n:.0f}, the reported {pct:.1f}% "
            f"would require k = {implied:.3f} successes. "
            f"No integer k produces {pct:.1f}% after rounding to 1 decimal."
        )
    elif implied is not None:
        result = "inconsistent"
        result_long = (
            f"With n = {n:.0f}, the implied count is "
            f"{implied:.3f} (off-integer by {round_diff:.3f}). "
            f"Borderline; could be a rounding artifact."
        )
    else:
        result = "not_testable"
        result_long = "Insufficient data to apply the test."

    severity = promote_severity(
        Severity.MEDIUM,
        impossible=impossible,
    )
    confidence = float(finding_dict.get("confidence", 0.5))

    # Safe
    # format
    # strings:
    # if
    # ``pct`` /
    # ``n`` /
    # ``implied``
    # is
    # ``None``
    # the
    # original
    # f-strings
    # raised
    # ``TypeError``.
    # The
    # report
    # should
    # never
    # crash
    # on
    # partial
    # data.
    pct_str = f"{pct:.1f}%" if pct is not None else "?"
    n_str = f"{n:.0f}" if n is not None else "?"
    implied_str = f"{implied:.3f}" if implied is not None else "?"
    summary = (
        f"Figure body text contains a percentage ({pct_str}) "
        f"that is arithmetically inconsistent with sample size n = {n_str}."
    ) if impossible else (
        f"Figure body text contains a percentage ({pct_str}) "
        f"whose implied count is {implied_str} (n = {n_str})."
    )

    return NumericalFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=severity,
        confidence=confidence,
        detector="figure_grim",
        summary=summary,
        location=Location(
            page=page + 1 if page is not None else None,
            source_image=None,
        ),
        test_name="percentage_sample_size_consistency",
        test_description=(
            "GRIM-style check: the reported percentage is "
            "inconsistent with the stated sample size if no "
            "integer k in [0, n] produces the value after "
            "rounding."
        ),
        input_values={
            "reported_percentage": pct,
            "candidate_n": n,
            "implied_count": implied,
            "ocr_text": text,
        },
        expected_constraint=(
            f"There must exist an integer k in [0, {n:.0f}] "
            f"such that round(k / {n:.0f} * 100, 1) == {pct:.1f}."
            if (n is not None and pct is not None)
            else "n/a"
        ),
        observed_value=(
            f"implied_count = {implied:.4f}"
            if implied is not None
            else "n/a"
        ),
        result=result,
        reasoning=result_long,
        limitations=[
            "OCR confidence is finite; the percentage or the n may be misread.",
            "The candidate n is the smallest n that produced a borderline match; the true n may be larger.",
            "If the figure shows a derived metric (e.g. a ratio) rather than a raw percentage, the test does not apply.",
        ],
        raw_finding=finding_dict,
    )


def explain_stat_percent(finding_dict: dict[str, Any]) -> NumericalFinding:
    """stat_percent detector: same shape as figure_grim but from raw tables."""

    return explain_figure_grim(finding_dict)  # same logic; we just relabel


def explain_image_forensics(finding_dict: dict[str, Any]) -> Any:
    """image_forensics fires when a single image has near-duplicate
    regions (a copy-move artifact).

    R-2026-06-12: this is
    a *visual* finding,
    not a numerical one,
    so we return a
    VisualFinding. The
    detector's raw fields
    are ``page``,
    ``index``, ``grid``,
    ``match_count``,
    ``best`` (a dict with
    cell_a, cell_b,
    hamming), and
    ``image_path``."""

    # Imported
    # here
    # to
    # avoid
    # circular
    # import
    # (visual_evidence
    # imports
    # this
    # file).
    from .evidence import VisualFinding

    # The benchmark ``findings.json`` schema wraps the
    # detector-specific fields under ``raw``. The
    # dispatcher already lifts them via ``_unwrap_raw``;
    # we read them at the top level here.
    if finding_dict.get("kind") in {
        "texture_overlap",
        "near_texture_overlap",
        "rotated_texture_overlap",
    }:
        kind = finding_dict.get("kind")
        is_near = kind == "near_texture_overlap"
        is_rotated = kind == "rotated_texture_overlap"
        image_a = finding_dict.get("image_a", {}) or {}
        image_b = finding_dict.get("image_b", {}) or {}
        cell_a = finding_dict.get("cell_a", [0, 0])
        cell_b = finding_dict.get("cell_b", [0, 0])
        grid = finding_dict.get("grid", 4)
        cell_side = finding_dict.get("cell_side")
        hash_distance = finding_dict.get("hash_distance")
        rotation_degrees = finding_dict.get("rotation_degrees")
        std_a = finding_dict.get("std_a")
        std_b = finding_dict.get("std_b")
        if is_near:
            reasoning = (
                "Found similar high-variance local texture across images "
                f"between cell {tuple(cell_a)} and cell {tuple(cell_b)} "
                f"(hash distance {hash_distance}). This can match reused "
                "protein-band texture, repeated shadows, or a copied defect "
                "after brightness or compression changes, and needs manual "
                "inspection against the original source data."
            )
        elif is_rotated:
            reasoning = (
                "Found matching high-variance local texture across images "
                "after a right-angle rotation "
                f"({rotation_degrees} degrees), between cell {tuple(cell_a)} "
                f"and cell {tuple(cell_b)}. This can match reused protein-band "
                "texture, repeated shadows, or a copied defect, and needs manual "
                "inspection against the original source data."
            )
        else:
            reasoning = (
                "Found identical high-variance local texture across images "
                f"between cell {tuple(cell_a)} and cell {tuple(cell_b)}. "
                "This can match reused protein-band texture, repeated shadows, "
                "or a copied defect, and needs manual inspection against the "
                "original source data."
            )
        return VisualFinding(
            finding_id=finding_dict.get("finding_id", ""),
            severity=Severity.MEDIUM if is_near or is_rotated else Severity.HIGH,
            confidence=0.65 if is_near or is_rotated else 0.75,
            detector="image_forensics",
            summary=(
                "Possible similar local texture across images."
                if is_near
                else "Possible rotated local texture across images."
                if is_rotated
                else "Possible reused local texture across images."
            ),
            location_a=Location(
                page=image_a.get("page") + 1 if image_a.get("page") is not None else None,
                image_index=image_a.get("index"),
                source_image=image_a.get("image_path"),
                note=f"cell {tuple(cell_a)}",
            ),
            location_b=Location(
                page=image_b.get("page") + 1 if image_b.get("page") is not None else None,
                image_index=image_b.get("index"),
                source_image=image_b.get("image_path"),
                note=f"cell {tuple(cell_b)}",
            ),
            metrics={
                "grid": grid,
                "cell_side": cell_side,
                "hash_distance": hash_distance,
                "rotation_degrees": rotation_degrees,
                "std_a": std_a,
                "std_b": std_b,
            },
            reasoning=reasoning,
            limitations=[
                "The detector compares aligned grid cells, so shifted reuse may be missed.",
                "Repeated acquisition artifacts or reused controls can be legitimate in context.",
                "This is a screening signal, not a standalone conclusion of image manipulation.",
            ],
            manual_review=[
                "Inspect both source images at full resolution.",
                "Check whether the paper explicitly reuses the same control or panel.",
                "Compare the flagged regions against original/raw image files when available.",
            ],
            raw_finding=finding_dict,
        )

    page = finding_dict.get("page")
    index = finding_dict.get("index")
    image_path = finding_dict.get("image_path")
    grid = finding_dict.get("grid", 8)
    match_count = finding_dict.get("match_count", 0)
    best = finding_dict.get("best", {}) or {}
    hamming = best.get("hamming", 0)
    cell_a = best.get("cell_a", [0, 0])
    cell_b = best.get("cell_b", [0, 0])
    if hamming == 0:
        reasoning = (
            f"Found {match_count} near-duplicate grid-cell pair(s) "
            f"within the same image. The strongest match "
            f"(hamming = 0, i.e. identical) is between cell "
            f"{tuple(cell_a)} and cell {tuple(cell_b)}. "
            f"This often indicates a small region was cloned to "
            f"cover something up or that the image was "
            f"constructed from repeated tiles."
        )
    else:
        reasoning = (
            f"Found {match_count} near-duplicate grid-cell pair(s) "
            f"within the same image. The strongest match "
            f"(hamming = {hamming}) is between cell {tuple(cell_a)} "
            f"and cell {tuple(cell_b)}. A single near-duplicate "
            f"may be coincidental; multiple pairs are stronger evidence."
        )
    severity = promote_severity(Severity.MEDIUM, hamming=hamming)
    return VisualFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=severity,
        confidence=0.7 if hamming == 0 else 0.5,
        detector="image_forensics",
        summary=(
            f"Possible copy-move region inside the image on "
            f"page {page + 1 if page is not None else '?'}."
        ),
        location_a=Location(
            page=page + 1 if page is not None else None,
            image_index=index,
            source_image=image_path,
            score=float(hamming),
            note=f"cell {tuple(cell_a)} (hamming = {hamming})",
        ),
        location_b=Location(
            page=page + 1 if page is not None else None,
            image_index=index,
            source_image=image_path,
            score=float(hamming),
            note=f"cell {tuple(cell_b)} (hamming = {hamming})",
        ),
        metrics={
            "phash_distance": hamming,
            "match_count": match_count,
            "grid": grid,
        },
        reasoning=reasoning,
        limitations=[
            "Repeated patterns are sometimes legitimate (e.g. antibody arrays, dot blots).",
            "Panel segmentation is uncertain for vector-drawn figures.",
            "The matched cells may share visual structure for biological, not fabrication, reasons.",
        ],
        manual_review=[
            "Inspect the source image at full resolution.",
            "Check the figure legend for repeated control panels.",
            "Compare against the publisher's source data if available.",
        ],
        raw_finding=finding_dict,
    )


def explain_panel_dup(finding_dict: dict[str, Any]) -> Any:
    """panel_dup: two panels on different pages share a low Hamming distance."""

    from .evidence import VisualFinding

    page_a = finding_dict.get("page_a")
    panel_a = finding_dict.get("panel_a")
    page_b = finding_dict.get("page_b")
    panel_b = finding_dict.get("panel_b")
    hamming = finding_dict.get("hamming", 0)
    severity = promote_severity(Severity.MEDIUM, hamming=hamming)
    return VisualFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=severity,
        confidence=0.85 if hamming <= 3 else 0.6,
        detector="panel_dup",
        summary=(
            f"Panel {panel_a} on page {page_a} and panel {panel_b} on "
            f"page {page_b} share a pHash distance of {hamming}."
        ),
        location_a=Location(
            page=page_a,
            image_index=panel_a,
            panel=str(panel_a) if panel_a is not None else None,
            source_image=None,  # not stored in raw; visual_evidence re-derives
            score=float(hamming),
        ),
        location_b=Location(
            page=page_b,
            image_index=panel_b,
            panel=str(panel_b) if panel_b is not None else None,
            source_image=None,
            score=float(hamming),
        ),
        metrics={
            "phash_distance": hamming,
            "transformation": "unknown",
        },
        reasoning=(
            f"Two panels in different figure contexts share "
            f"a pHash distance of {hamming} (out of 64 bits). "
            f"Hamming <= 5 is considered a strong match."
        ),
        limitations=[
            "Panel segmentation uses whitespace-gap detection; small or touching panels may be missed.",
            "The same experimental control may legitimately be reused across figures.",
            "No raw pixel-level comparison was done -- a stronger match would also include SSIM / feature matching.",
        ],
        manual_review=[
            "Open both panels at full resolution and compare visually.",
            "Check the figure captions -- reused control panels are sometimes explicitly described.",
            "Look for a publisher's correction / retraction notice.",
        ],
        raw_finding=finding_dict,
    )


def explain_image_dup(finding_dict: dict[str, Any]) -> Any:
    """image_dup: two distinct images are near-duplicates by pHash."""

    from .evidence import VisualFinding

    a = finding_dict.get("image_a", {}) or {}
    b = finding_dict.get("image_b", {}) or {}
    hamming = finding_dict.get("hamming", 0)
    severity = promote_severity(Severity.MEDIUM, hamming=hamming)
    return VisualFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=severity,
        confidence=0.95 if hamming == 0 else 0.7,
        detector="image_dup",
        summary=(
            f"Two distinct images on page {a.get('page', '?') + 1} "
            f"and page {b.get('page', '?') + 1} are near-duplicates "
            f"(pHash distance = {hamming})."
        ),
        location_a=Location(
            page=(a.get("page", 0) + 1) if a.get("page") is not None else None,
            image_index=a.get("index"),
            source_image=None,  # not stored in raw; visual_evidence re-derives
            score=float(hamming),
        ),
        location_b=Location(
            page=(b.get("page", 0) + 1) if b.get("page") is not None else None,
            image_index=b.get("index"),
            source_image=None,
            score=float(hamming),
        ),
        metrics={
            "phash_distance": hamming,
        },
        reasoning=(
            f"Two distinct images share a pHash distance of {hamming} "
            f"out of 64 bits. An exact or near-exact match between "
            f"images in different figure contexts is a strong "
            f"signal of possible image duplication."
        ),
        limitations=[
            "pHash is a perceptual hash, not a pixel-exact match -- two visually similar but different images may share a low Hamming distance.",
            "The same positive control may legitimately appear in multiple panels.",
            "Without raw source data, the only way to confirm the duplication is manual visual comparison.",
        ],
        manual_review=[
            "Compare the two images at full resolution.",
            "Check the figure legends and methods text for shared control descriptions.",
            "Look for a publisher's correction / retraction notice.",
        ],
        raw_finding=finding_dict,
    )


def explain_figure_stat_text(finding_dict: dict[str, Any]) -> Any:
    """figure_stat_text: OCR found a statistical descriptor in a figure body.

    R-2026-06-12: this is
    weak evidence on its
    own -- it just records
    that the OCR saw
    something like
    "p < 0.001" or
    "n = 12" in the
    figure. The report
    treats these as
    *metadata* findings
    (recorded for
    auditability) rather
    than active
    suspicions."""

    from .evidence import MetadataFinding

    page = finding_dict.get("page")
    text = finding_dict.get("text", "")
    confidence = float(finding_dict.get("confidence", 0.5))
    return MetadataFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=Severity.INFO,
        confidence=confidence,
        detector="figure_stat_text",
        summary=(
            f"OCR detected a statistical descriptor in the body "
            f"of the figure on page {(page or 0) + 1}."
        ),
        location=Location(
            page=(page or 0) + 1 if page is not None else None,
            source_image=None,
        ),
        reasoning=(
            f"Recognised text (confidence {confidence:.2f}): "
            f"{(text or '')[:200]!r}"
        ),
        limitations=[
            "OCR is not 100% accurate; the text may be misread.",
            "The presence of a statistical descriptor is not itself a red flag -- it just records what the figure body says.",
        ],
        raw_finding=finding_dict,
    )


def explain_data_availability(finding_dict: dict[str, Any]) -> Any:
    """data_availability_concern: no data-availability section / vague language."""

    from .evidence import MetadataFinding

    return MetadataFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=Severity.LOW,
        confidence=0.7,
        detector="data_availability_concern",
        summary=finding_dict.get("title", "Data-availability concern"),
        location=Location(source_image=None),
        reasoning=finding_dict.get("evidence", ""),
        limitations=[
            "Many older papers (pre-2014 PLOS) genuinely have no data-availability section by journal policy.",
            "Some journals allow 'available upon reasonable request' which is not necessarily a red flag.",
        ],
        raw_finding=finding_dict,
    )


def explain_table_relationships(finding_dict: dict[str, Any]) -> NumericalFinding:
    """table_relationships: arithmetic or distribution anomalies in tables."""

    try:
        severity = Severity(finding_dict.get("severity", "medium"))
    except ValueError:
        severity = Severity.MEDIUM
    check = str(finding_dict.get("check") or "table_relationship")
    title = finding_dict.get("title") or "Suspicious table relationship"
    location_text = finding_dict.get("location") or ""
    input_values = {
        key: value
        for key, value in finding_dict.items()
        if key
        not in {
            "finding_id",
            "trace_id",
            "detector",
            "severity",
            "title",
            "evidence",
            "location",
            "raw",
        }
    }
    observed = finding_dict.get("evidence") or title
    return NumericalFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=severity,
        confidence=0.7,
        detector="table_relationships",
        summary=title,
        location=Location(note=location_text),
        test_name=check,
        test_description=(
            "Check manuscript table values for exact arithmetic, repeated "
            "decimal-tail, duplicate-rate, mirror, or terminal-digit patterns."
        ),
        input_values=input_values,
        expected_constraint=(
            "Independent experimental measurements should not show exact, "
            "mechanical relationships unless the manuscript explicitly explains "
            "the transformation or shared control."
        ),
        observed_value=str(observed),
        result="unusual",
        reasoning=(
            f"{title}. This is a screening signal from table_relationships, "
            "not a standalone conclusion of fabrication."
        ),
        limitations=[
            "Derived, normalized, or reused-control columns can legitimately have exact relationships.",
            "Manual review should check table captions, methods, and source data before drawing conclusions.",
        ],
        raw_finding=finding_dict,
    )


# Dispatcher
# --
# each
# finding's
# ``detector``
# field
# picks
# the
# right
# explainer.
_EXPLAINERS = {
    "figure_grim": explain_figure_grim,
    "stat_percent": explain_stat_percent,
    "stat_grim": explain_figure_grim,
    "stat_pvalue": explain_figure_grim,  # placeholder; p-value findings get a similar card
    "image_forensics": explain_image_forensics,
    "panel_dup": explain_panel_dup,
    "image_dup": explain_image_dup,
    "page_raster_dup": explain_image_dup,  # same shape, different detector
    "figure_stat_text": explain_figure_stat_text,
    "data_availability_concern": explain_data_availability,
    "table_relationships": explain_table_relationships,
}


def _unwrap_raw(finding_dict: dict[str, Any]) -> dict[str, Any]:
    """Flatten the benchmark ``raw`` envelope onto the top level.

    The benchmark
    ``findings.json``
    schema wraps the
    detector-specific
    fields under ``raw``
    (e.g.
    ``finding["raw"]["page"]``).
    Most explainers want
    to read fields
    directly
    (``finding["page"]``).
    We lift ``raw.*``
    onto the top level
    shallowly so the
    explainers stay
    short.

    Note: we do NOT
    overwrite a top-level
    field with a
    ``raw`` field, since
    the wrapper sometimes
    carries metadata
    (e.g. a path that's
    already been resolved)
    that we should not
    clobber."""

    raw = finding_dict.get("raw") or {}
    if not raw:
        return finding_dict
    out = dict(finding_dict)
    for k, v in raw.items():
        out.setdefault(k, v)
    return out


def explain_finding(finding_dict: dict[str, Any]) -> Any | None:
    """Pick the right explainer for a finding dict.

    Returns ``None`` for
    detectors we haven't
    wired up yet -- the
    renderer should treat
    these as a generic
    metadata entry."""

    detector = finding_dict.get("detector", "")
    explainer = _EXPLAINERS.get(detector)
    if explainer is None:
        return None
    return explainer(_unwrap_raw(finding_dict))


def explain_stat_pvalue(finding_dict: dict[str, Any]) -> NumericalFinding:
    """stat_pvalue: a reported p-value does not match the test statistic.

    R-2026-06-12: a
    typical shape is
    ``{'test': 't',
    'df': 18, 't': 2.31,
    'reported_p': 0.034,
    'computed_p': 0.033}``.
    We summarise the
    discrepancy in plain
    English."""

    test = finding_dict.get("test", "")
    df = finding_dict.get("df")
    t = finding_dict.get("t") or finding_dict.get("statistic")
    rep = _safe_float(finding_dict.get("reported_p"))
    cmp = _safe_float(finding_dict.get("computed_p"))
    page = finding_dict.get("page")

    if cmp is not None and rep is not None:
        diff = abs(cmp - rep)
        if diff < 0.005:
            result = "consistent"
            result_long = (
                f"Reported p = {rep} is consistent with the recomputed "
                f"p = {cmp:.3f} for {test}({df}) = {t}."
            )
        else:
            result = "inconsistent"
            result_long = (
                f"Reported p = {rep}, but the recomputed p = {cmp:.3f} "
                f"for {test}({df}) = {t} differs by {diff:.3f}."
            )
    else:
        result = "not_testable"
        result_long = "Insufficient data to recompute the p-value."

    return NumericalFinding(
        finding_id=finding_dict.get("finding_id", ""),
        severity=Severity.MEDIUM,
        confidence=0.6,
        detector="stat_pvalue",
        summary=(
            f"Reported p-value does not match the recomputed value "
            f"for the stated test statistic."
        ),
        location=Location(page=page),
        test_name="pvalue_recomputation",
        test_description=(
            "Recompute the p-value from the reported test statistic "
            "and degrees of freedom and compare to the reported p."
        ),
        input_values={
            "test": test,
            "df": df,
            "statistic": t,
            "reported_p": rep,
            "computed_p": cmp,
        },
        expected_constraint=(
            "reported_p should equal the p-value implied by the "
            "test statistic and degrees of freedom."
        ),
        observed_value=result_long,
        result=result,
        reasoning=result_long,
        limitations=[
            "The reported p may be from a one-tailed test while we recomputed a two-tailed.",
            "Some software (SPSS, GraphPad) reports rounded p-values that are slightly off.",
            "OCR uncertainty on the test statistic can shift the recomputed p.",
        ],
        raw_finding=finding_dict,
    )


# Update
# the
# dispatcher
# to
# include
# the
# dedicated
# p-value
# explainer.
_EXPLAINERS["stat_pvalue"] = explain_stat_pvalue
