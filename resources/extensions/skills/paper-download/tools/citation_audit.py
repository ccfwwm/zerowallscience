r"""Citation audit for LaTeX (.tex) and Markdown (.md) papers.

Generalization of `~/musicology-phd/scripts/verify_claims.py` +
`validate_claims_s2.py` (which were hardcoded for Paper 9α). Parametric
by source file path.

Workflow :
1. Parse the source file for citations :
   - LaTeX : \cite{key}, \citep{key}, \citet{key}, \citeauthor{key}
   - Markdown : [[slug]] (Obsidian) or [text](refs/slug.md) (flat)
2. For each citation key/slug :
   a. Look up the corresponding ref in the registry
   b. If found and state is `page1_validated`+, read the PDF
   c. Extract the claim context from the source file (line + surrounding
      sentence)
   d. Search the PDF for the claim's keywords
   e. Classify : VALID / ADJUST / INVALID / UNVERIFIABLE
3. Output : RECEIPTS.md adjacent to the source file

Mode dry-run by default. Use --write-receipts to actually write the
RECEIPTS.md file.

Usage :
    python tools/citation_audit.py path/to/paper.tex
    python tools/citation_audit.py path/to/paper.md --write-receipts
    python tools/citation_audit.py path/to/paper.tex --local-only  # skip Crossref
"""
from __future__ import annotations
import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Inject plugin root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.config import REFS, SOURCES, VAULT_LAYOUT
from pipeline.registry import load_ref


_LATEX_CITE_RE = re.compile(r"\\cite[a-z]*\{([^}]+)\}")
_WIKILINK_RE = re.compile(r"\[\[([a-z0-9_]+)\]\]")
_MD_LINK_RE = re.compile(r"\]\((?:[^)]*?/)?([a-z0-9_]+)\.md\)")


def parse_citations(source_path: Path) -> list[tuple[str, int]]:
    """Returns list of (citation_key_or_slug, line_number)."""
    try:
        lines = source_path.read_text(encoding="utf-8",
                                       errors="replace").splitlines()
    except OSError:
        return []
    is_latex = source_path.suffix.lower() == ".tex"

    citations: list[tuple[str, int]] = []
    for lineno, line in enumerate(lines, start=1):
        if is_latex:
            for m in _LATEX_CITE_RE.finditer(line):
                # \cite{key1,key2} → split on comma
                for key in m.group(1).split(","):
                    key = key.strip()
                    if key:
                        citations.append((key, lineno))
        else:
            # Markdown : try wikilinks first, then markdown links
            for m in _WIKILINK_RE.finditer(line):
                citations.append((m.group(1), lineno))
            for m in _MD_LINK_RE.finditer(line):
                citations.append((m.group(1), lineno))
    return citations


def extract_claim_context(source_path: Path, lineno: int,
                          window: int = 1) -> str:
    """Return the sentence(s) around the cited line."""
    try:
        lines = source_path.read_text(encoding="utf-8",
                                       errors="replace").splitlines()
    except OSError:
        return ""
    start = max(0, lineno - 1 - window)
    end = min(len(lines), lineno + window)
    return " ".join(lines[start:end]).strip()


def audit_one(slug: str, lineno: int, source_path: Path,
              local_only: bool = False) -> dict:
    """Audit a single citation.

    Returns dict with verdict + evidence.
    """
    record = {
        "slug": slug,
        "manuscript_line": lineno,
        "manuscript_context": extract_claim_context(source_path, lineno),
        "verdict": "UNVERIFIABLE",
        "ref_state": None,
        "pdf_exists": False,
        "reason": "",
    }

    # Look up the ref in the registry
    ref_path = REFS / f"{slug}.md"
    if not ref_path.exists():
        record["reason"] = "ref absente du registre"
        return record

    ref = load_ref(ref_path)
    if ref is None:
        record["reason"] = "ref unparseable"
        return record

    record["ref_state"] = ref.state

    # Locate the PDF
    pdf_path = ref.frontmatter.get("pdf_path")
    if not pdf_path:
        record["reason"] = "pas de pdf_path"
        return record

    pdf_abs = SOURCES / pdf_path
    if not pdf_abs.exists():
        record["reason"] = f"pdf inexistant: {pdf_path}"
        return record
    record["pdf_exists"] = True

    # Check that the state allows citation
    if ref.state not in ("page1_validated", "sota_cited_confirmed",
                         "awaiting_rtfm_ocr"):
        record["verdict"] = "INVALID"
        record["reason"] = (f"ref state {ref.state!r} pas validé pour citation "
                            f"(attendu page1_validated+)")
        return record

    # Extract first ~5000 chars of PDF for keyword search
    try:
        proc = subprocess.run(
            ["pdftotext", "-layout", str(pdf_abs), "-"],
            capture_output=True, text=True, timeout=30,
        )
    except (subprocess.TimeoutExpired, OSError):
        record["reason"] = "pdftotext timeout/error"
        return record

    if proc.returncode != 0:
        record["reason"] = f"pdftotext exit {proc.returncode}"
        return record

    pdf_text = (proc.stdout or "")[:50000].lower()

    # Extract keywords from the manuscript context (≥ 5 letters, alpha)
    context = record["manuscript_context"]
    keywords = [w.lower() for w in re.findall(r"\b[A-Za-z]{5,}\b", context)
                if w.lower() not in {"prove", "shows", "shown", "argue",
                                     "suggest", "claim", "paper", "study",
                                     "result", "research", "table", "figure"}]
    keywords = list(dict.fromkeys(keywords))[:10]  # top 10 unique

    if not keywords:
        record["verdict"] = "UNVERIFIABLE"
        record["reason"] = "no extractable keywords from manuscript context"
        return record

    # Count keyword hits in PDF
    hits = sum(1 for k in keywords if k in pdf_text)
    ratio = hits / len(keywords)

    if ratio >= 0.5:
        record["verdict"] = "VALID"
        record["reason"] = f"{hits}/{len(keywords)} keywords found in PDF"
    elif ratio >= 0.2:
        record["verdict"] = "ADJUST"
        record["reason"] = (f"only {hits}/{len(keywords)} keywords found — "
                            f"claim may need rephrasing")
    else:
        record["verdict"] = "INVALID"
        record["reason"] = (f"only {hits}/{len(keywords)} keywords found — "
                            f"claim likely doesn't match source")

    return record


def write_receipts(source_path: Path, audits: list[dict]) -> Path:
    """Write RECEIPTS.md adjacent to the source file."""
    receipts_path = source_path.parent / f"RECEIPTS.md"

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines = [
        f"# RECEIPTS — {source_path.name}",
        "",
        f"Generated: {now_iso}",
        f"Source: {len(audits)} citation(s) parsed",
        f"Skill: paper-trail/citation-receipts (tools/citation_audit.py)",
        "",
        "---",
        "",
    ]

    for i, a in enumerate(audits, start=1):
        lines.extend([
            f"## Citation {i} — [{a['slug']}]",
            "",
            f"**Status**: {a['verdict']}",
            "",
            f"**Manuscript line**: {a['manuscript_line']}",
            "",
            f"**Manuscript context**:",
            f"> {a['manuscript_context']}",
            "",
            f"**Ref state**: {a['ref_state'] or '(not in registry)'}",
            f"**PDF exists**: {a['pdf_exists']}",
            "",
            f"**Notes**: {a['reason']}",
            "",
            "---",
            "",
        ])

    # Recap
    from collections import Counter
    verdicts = Counter(a["verdict"] for a in audits)
    lines.extend([
        "## Recap",
        "",
        "| Status | Count |",
        "|---|---|",
    ])
    for v in ["VALID", "ADJUST", "INVALID", "UNVERIFIABLE"]:
        lines.append(f"| {v} | {verdicts.get(v, 0)} |")
    lines.extend([
        "",
        f"Total: {len(audits)} citations audited.",
        "",
        f"Action required: "
        f"{verdicts.get('ADJUST', 0) + verdicts.get('INVALID', 0) + verdicts.get('UNVERIFIABLE', 0)} "
        f"citation(s) needing review before submission.",
    ])

    receipts_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return receipts_path


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="Path to the source .tex or .md file")
    p.add_argument("--write-receipts", action="store_true",
                   help="Write RECEIPTS.md adjacent to the source (default: stdout summary only)")
    p.add_argument("--local-only", action="store_true",
                   help="Skip remote API calls (no Crossref enrichment)")
    args = p.parse_args()

    source_path = Path(args.source)
    if not source_path.exists():
        print(f"[citation_audit] source file not found: {source_path}",
              file=sys.stderr)
        return 2

    citations = parse_citations(source_path)
    if not citations:
        print(f"# No citations found in {source_path}")
        return 0

    print(f"# citation_audit — {source_path}")
    print(f"# {len(citations)} citation(s) parsed")
    print()

    audits = []
    for slug, lineno in citations:
        a = audit_one(slug, lineno, source_path, local_only=args.local_only)
        audits.append(a)
        print(f"  [{a['verdict']:<14}] L{lineno:>4}  [{slug}]  {a['reason']}")

    # Summary
    from collections import Counter
    verdicts = Counter(a["verdict"] for a in audits)
    print()
    print("Recap :")
    for v in ["VALID", "ADJUST", "INVALID", "UNVERIFIABLE"]:
        print(f"  {v:<14} {verdicts.get(v, 0):>3}")

    if args.write_receipts:
        receipts_path = write_receipts(source_path, audits)
        print()
        print(f"RECEIPTS.md written to: {receipts_path}")

    # Exit code : 0 if all VALID, 1 if any ADJUST/INVALID/UNVERIFIABLE
    n_problem = (verdicts.get("ADJUST", 0)
                 + verdicts.get("INVALID", 0)
                 + verdicts.get("UNVERIFIABLE", 0))
    return 0 if n_problem == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
