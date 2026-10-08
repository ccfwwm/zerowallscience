"""Generate a review report for references requiring human decision.

For each problematic ref, collect everything needed to decide :
- identity (slug, author, title, year, uid)
- current state + why blocked
- citation context (passages of SOTAs / papers that cite this ref)
- acquisition history (sources tried, verdicts)
- PDF info if any (existence on disk, RTFM index status, sha256)
- legacy info (state before reset, retracted_reason)
- recommended action (heuristic)

Output: a Markdown report, one section per ref, suitable for review
in any editor.

Usage:
    python tools/review_problems.py --state uid_resolved --limit 20
    python tools/review_problems.py --state needs_reacquisition
    python tools/review_problems.py --ref-slug arnold_1982_xyz
    python tools/review_problems.py --output review_2026-05-26.md
    python tools/review_problems.py --states uid_resolved,candidate,needs_reacquisition
"""
from __future__ import annotations
import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

# Resolve plugin root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import REFS, SOURCES, VAULT
from pipeline.registry import iter_refs, load_ref

_WIKILINK_RE = re.compile(r"\[\[([a-z0-9_]+)\]\]")


def build_citations_index() -> dict[str, list[tuple[Path, int, str]]]:
    """Scan all .md files in the vault, build slug -> [(sota_path, lineno, snippet), ...].

    For each wikilink [[slug]] found, store the path, line number, and a
    ±2 lines context snippet around it.
    """
    index: dict[str, list[tuple[Path, int, str]]] = defaultdict(list)
    if not VAULT.exists():
        return index
    for md_path in VAULT.rglob("*.md"):
        # Skip the registry refs themselves
        if "_registry/refs/" in str(md_path):
            continue
        try:
            lines = md_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for lineno, line in enumerate(lines, start=1):
            for m in _WIKILINK_RE.finditer(line):
                slug = m.group(1)
                # Snippet : 2 lines before + the line + 2 lines after
                start = max(0, lineno - 3)
                end = min(len(lines), lineno + 2)
                snippet = "\n".join(lines[start:end]).strip()
                index[slug].append((md_path, lineno, snippet))
    return index


def recommend_action(ref, citations_idx: dict | None = None) -> str:
    """Heuristic recommendation based on ref state, attempts, and citation context.

    PRIORITY CHECK : if `citations_idx` is provided and the ref is NOT cited
    in any SOTA or article outside `_registry/INDEX.md`, the recommendation
    is RETRACT regardless of cascade status. Empirically, a ref with no
    real citation has no impact on the corpus — retracting frees the
    registry from drift without losing anything.
    """
    fm = ref.frontmatter
    state = fm.get("state", "")
    attempts = fm.get("acquisition_attempts") or []
    legacy_state = fm.get("legacy_state", "")
    legacy_retracted = fm.get("legacy_retracted_reason")

    # PRIORITY : ref not cited anywhere outside registry INDEX
    if citations_idx is not None:
        all_cites = citations_idx.get(ref.slug, [])
        real_cites = [c for c in all_cites if "INDEX.md" not in str(c[0])]
        if not real_cites:
            return "RETRACT — not cited in any SOTA or article (only in registry INDEX)"

    if state == "candidate":
        if not fm.get("uid") and not fm.get("title"):
            return "RETRACT — no UID, no title → probable extraction artifact"
        if not attempts:
            return "WAIT — UID resolution not yet attempted"
        return "INVESTIGATE — UID resolution failed; check author/title accuracy"

    if state == "uid_resolved":
        if not attempts:
            return "WAIT — cascade not yet attempted"
        all_no_source = all(a.get("verdict") == "no_source" for a in attempts)
        all_failed = all(a.get("verdict") in ("no_source", "failed", "page1_failed", "skipped_already_tried", "skipped_breaker_open") for a in attempts)
        if all_no_source:
            return "RETRACT — no source has any match → likely fabricated or extraction artifact"
        if all_failed:
            return "BLOCKED_HUMAN — paywall or unavailable; try institutional VPN, author contact, ILL"
        return "INVESTIGATE — mixed verdicts, manual check"

    if state == "needs_reacquisition":
        last_reason = ""
        for a in reversed(attempts):
            if a.get("reason"):
                last_reason = a["reason"]
                break
        if "homonym" in last_reason.lower() or "mismatch" in last_reason.lower():
            return "RETRACT or INVESTIGATE — homonymy detected; verify the citation context"
        return "RETRY — relaunch cascade for this ref"

    if legacy_retracted and state == "page1_validated":
        return "CONFIRM — was retracted historically but new process accepts; verify identity"

    return "REVIEW — manual inspection needed"


def render_ref_section(ref, citations_idx: dict, ord_num: int) -> str:
    """Render a markdown section for one ref."""
    fm = ref.frontmatter
    slug = ref.slug
    state = fm.get("state", "?")

    sections: list[str] = []

    # Heading
    sections.append(f"## {ord_num}. {slug}")
    sections.append("")

    # Identity
    sections.append("**Identity**")
    sections.append(f"- author: {fm.get('author') or '_(none)_'}")
    sections.append(f"- year: {fm.get('year') or '_(none)_'}")
    sections.append(f"- title: {fm.get('title') or '_(none)_'}")
    sections.append(f"- uid: `{fm.get('uid') or '_(none)_'}`")
    sections.append(f"- state: **{state}**")
    if fm.get("blocked_by"):
        sections.append(f"- blocked_by: `{fm['blocked_by']}`")
    if fm.get("blocked_reason"):
        sections.append(f"- blocked_reason: {fm['blocked_reason']}")
    sections.append("")

    # PDF status
    pdf_path = fm.get("pdf_path")
    if pdf_path:
        abs_p = SOURCES / pdf_path
        size = abs_p.stat().st_size if abs_p.exists() else 0
        sections.append("**PDF**")
        sections.append(f"- pdf_path: `{pdf_path}`")
        sections.append(f"- exists on disk: {'yes' if abs_p.exists() else 'NO'}")
        if abs_p.exists():
            sections.append(f"- size: {size // 1024} KB")
        if fm.get("pdf_sha256"):
            sections.append(f"- sha256: `{fm['pdf_sha256'][:12]}…`")
        sections.append("")

    # Legacy info
    legacy_fields = {
        "legacy_state": fm.get("legacy_state"),
        "legacy_pdf_path": fm.get("legacy_pdf_path"),
        "legacy_retracted_reason": fm.get("legacy_retracted_reason"),
        "legacy_retracted_at": fm.get("legacy_retracted_at"),
    }
    if any(legacy_fields.values()):
        sections.append("**Legacy (before reset)**")
        for k, v in legacy_fields.items():
            if v:
                sections.append(f"- {k}: `{v}`")
        sections.append("")

    # Acquisition attempts
    attempts = fm.get("acquisition_attempts") or []
    if attempts:
        sections.append(f"**Acquisition attempts** ({len(attempts)} total)")
        # Group by verdict
        by_verdict: dict[str, list[str]] = defaultdict(list)
        for a in attempts:
            v = a.get("verdict", "?")
            s = a.get("source", "?")
            by_verdict[v].append(s)
        for verdict in ("success", "page1_failed", "failed", "no_source",
                        "skipped_already_tried", "skipped_breaker_open"):
            srcs = by_verdict.get(verdict, [])
            if srcs:
                sections.append(f"- {verdict}: {', '.join(srcs)}")
        # Last attempt details if useful
        last = attempts[-1]
        if last.get("reason"):
            sections.append(f"- last reason: _{last['reason']}_")
        sections.append("")

    # Citation context
    citations = citations_idx.get(slug, [])
    if citations:
        sections.append(f"**Cited in {len(citations)} location(s)**")
        # Group by file
        by_file: dict[Path, list[tuple[int, str]]] = defaultdict(list)
        for sota_path, lineno, snippet in citations:
            by_file[sota_path].append((lineno, snippet))
        for sota_path, items in by_file.items():
            try:
                rel = sota_path.relative_to(VAULT)
            except ValueError:
                rel = sota_path
            sections.append(f"\n_{rel}_  ({len(items)} occurrence(s))")
            for lineno, snippet in items[:3]:  # max 3 per file
                sections.append("```")
                sections.append(f"L{lineno}: {snippet}")
                sections.append("```")
            if len(items) > 3:
                sections.append(f"  … and {len(items) - 3} more in this file")
        sections.append("")
    else:
        sections.append("**Cited in**: _(no occurrences found in vault)_")
        sections.append("")

    # Recommended action (citation check has priority over heuristics)
    rec = recommend_action(ref, citations_idx=citations_idx)
    sections.append(f"**Recommended action**: {rec}")
    sections.append("")

    # Ready-to-paste arbitrate command (default = recommendation)
    rec_upper = rec.split("—")[0].strip().split()[0].upper()
    decision_map = {
        "RETRACT": "retract",
        "BLOCKED_HUMAN": "blocked",
        "INVESTIGATE": "investigate",
        "WAIT": "investigate",
        "CONFIRM": "investigate",
        "REVIEW": "investigate",
    }
    decision = decision_map.get(rec_upper, "investigate")
    short_reason = rec.split("—", 1)[-1].strip().replace("'", "")[:80]
    sections.append("**Copy-paste si OK** (sinon remplace `" + decision +
                    "` par retract/blocked/investigate) :")
    sections.append("```bash")
    sections.append(f"python3 -m pipeline arbitrate {slug} "
                    f"--decision {decision} "
                    f"--reason \"{short_reason}\"")
    sections.append("```")
    sections.append("")

    # Direct file link
    rel_ref = ref.path.relative_to(VAULT) if VAULT in ref.path.parents else ref.path
    sections.append(f"_Edit ref file_: `{rel_ref}`")
    sections.append("")
    sections.append("---")
    sections.append("")

    return "\n".join(sections)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--state", help="Filter by single FSM state")
    p.add_argument("--states",
                   help="Filter by multiple states, comma-separated")
    p.add_argument("--ref-slug",
                   help="Generate report for one specific ref slug")
    p.add_argument("--limit", type=int, default=0,
                   help="Cap on number of refs in report (0 = no limit)")
    p.add_argument("--output", "-o",
                   help="Write report to file (default: stdout)")
    p.add_argument("--no-citations", action="store_true",
                   help="Skip vault scan for citation context (faster)")
    args = p.parse_args()

    # Filter
    if args.ref_slug:
        target = REFS / f"{args.ref_slug}.md"
        if not target.exists():
            print(f"Ref not found: {args.ref_slug}", file=sys.stderr)
            return 2
        refs = [load_ref(target)]
    else:
        states_filter: set[str] = set()
        if args.state:
            states_filter.add(args.state)
        if args.states:
            states_filter.update(s.strip() for s in args.states.split(","))
        if not states_filter:
            # Default : focus on problem states
            states_filter = {"uid_resolved", "candidate",
                             "needs_reacquisition", "awaiting_rtfm_ocr"}
        refs = [r for r in iter_refs() if r.state in states_filter]

    if args.limit:
        refs = refs[:args.limit]

    if not refs:
        print("No refs match the filter.")
        return 0

    # Build citation index
    citations_idx: dict = {}
    if not args.no_citations:
        print(f"Scanning vault for citation context...", file=sys.stderr)
        citations_idx = build_citations_index()

    # Generate report
    report_lines: list[str] = []
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report_lines.append(f"# Review report — {len(refs)} ref(s)")
    report_lines.append("")
    report_lines.append(f"Generated: {now_iso}")
    report_lines.append(f"Filter: {args.ref_slug or args.state or args.states or 'default (problem states)'}")
    report_lines.append("")
    # Summary by state
    from collections import Counter
    by_state = Counter(r.state for r in refs)
    report_lines.append("**By state**:")
    for state, n in by_state.most_common():
        report_lines.append(f"- {state}: {n}")
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")

    # One section per ref
    for i, ref in enumerate(refs, start=1):
        report_lines.append(render_ref_section(ref, citations_idx, i))

    report = "\n".join(report_lines)

    if args.output:
        Path(args.output).write_text(report, encoding="utf-8")
        print(f"Report written to {args.output} ({len(refs)} refs, "
              f"{len(report)} chars)", file=sys.stderr)
    else:
        print(report)

    return 0


if __name__ == "__main__":
    sys.exit(main())
