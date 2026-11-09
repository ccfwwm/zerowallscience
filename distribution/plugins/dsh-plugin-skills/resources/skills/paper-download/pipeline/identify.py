"""Module identify — première passe du pipeline INGEST refondu.

Read-only : pour chaque ParsedCitation, résout le DOI, croise avec le
registre, produit un verdict d'action. NE MUTE RIEN (ni SOTA ni registre).

Phase 5 du plan refonte INGEST. Le rapport produit guide les passes
suivantes (purge, acquire, linkify).
"""
from __future__ import annotations
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional


@dataclass
class IdentifiedMention:
    """Une mention détectée + son verdict d'identification."""
    raw: str
    author: str
    year: str
    title: str
    confidence: str
    resolved_doi: Optional[str] = None
    matched_slug: Optional[str] = None
    matched_via: Optional[str] = None  # "doi" | "fuzzy" | None
    slug_state: Optional[str] = None
    slug_has_pdf: bool = False
    slug_is_retracted: bool = False
    action_recommended: str = "create"
    would_create_slug: Optional[str] = None
    orphan_pdf_match: Optional[str] = None


@dataclass
class IdentifyReport:
    sota_path: Path
    mentions: list[IdentifiedMention] = field(default_factory=list)
    duration_seconds: float = 0.0
    errors: list[str] = field(default_factory=list)

    def stats(self) -> dict:
        return {
            "citations_total": len(self.mentions),
            "doi_resolved": sum(1 for m in self.mentions if m.resolved_doi),
            "matched_by_doi": sum(1 for m in self.mentions if m.matched_via == "doi"),
            "matched_by_fuzzy": sum(1 for m in self.mentions if m.matched_via == "fuzzy"),
            "n_reuse": sum(1 for m in self.mentions
                           if m.action_recommended == "reuse"),
            "n_create": sum(1 for m in self.mentions
                            if m.action_recommended == "create"),
            "n_reuse_retracted": sum(1 for m in self.mentions
                                     if m.action_recommended == "reuse_retracted"),
            "n_skipped_low": sum(1 for m in self.mentions
                                 if m.action_recommended == "skipped_low_confidence"),
            "n_orphan_pdf": sum(1 for m in self.mentions
                                if m.orphan_pdf_match),
        }

    def to_dict(self) -> dict:
        return {
            "sota": str(self.sota_path),
            "duration_seconds": round(self.duration_seconds, 2),
            "stats": self.stats(),
            "mentions": [asdict(m) for m in self.mentions],
            "errors": self.errors,
        }


def identify_sota(
    sota_path: Path,
    citations: list,  # list[ParsedCitation], typed loosely to avoid circular import
    skip_low_confidence: bool = False,
) -> IdentifyReport:
    """Pour chaque citation parsée, résout DOI + reconcile + verdict.

    `skip_low_confidence`: si True, marque les low-conf en
    `skipped_low_confidence` sans tenter la résolution DOI.
    """
    import time
    from .ingest import (
        _identify_doi, _reconcile_with_registry,
        _find_orphan_pdf_for_citation, _make_slug,
    )
    from .registry import load_ref
    from .config import REFS, SOURCES

    report = IdentifyReport(sota_path=sota_path)
    t_start = time.time()

    for cit in citations:
        mention = IdentifiedMention(
            raw=cit.raw,
            author=cit.author,
            year=cit.year,
            title=cit.title,
            confidence=cit.confidence,
        )
        try:
            if cit.confidence == "low" and skip_low_confidence:
                mention.action_recommended = "skipped_low_confidence"
                report.mentions.append(mention)
                continue

            doi = _identify_doi(cit)
            mention.resolved_doi = doi
            existing_slug = _reconcile_with_registry(cit, doi)

            if existing_slug:
                mention.matched_slug = existing_slug
                mention.matched_via = "doi" if doi else "fuzzy"
                ref_path = REFS / f"{existing_slug}.md"
                if ref_path.exists():
                    ref = load_ref(ref_path)
                    if ref:
                        mention.slug_state = ref.frontmatter.get("state")
                        mention.slug_has_pdf = bool(
                            ref.frontmatter.get("pdf_path"))
                        mention.slug_is_retracted = (
                            ref.frontmatter.get("state") == "retracted")
                mention.action_recommended = (
                    "reuse_retracted" if mention.slug_is_retracted else "reuse"
                )
            else:
                mention.would_create_slug = _make_slug(
                    cit.author, cit.year, cit.title
                )
                orphan = _find_orphan_pdf_for_citation(cit)
                if orphan is not None:
                    try:
                        mention.orphan_pdf_match = str(
                            orphan.relative_to(SOURCES))
                    except (ValueError, OSError):
                        mention.orphan_pdf_match = str(orphan)
                mention.action_recommended = "create"

            if cit.confidence == "low":
                mention.action_recommended = "skipped_low_confidence"

        except Exception as e:
            report.errors.append(
                f"identify {cit.raw[:50]!r}: {type(e).__name__}: {e}"
            )
        report.mentions.append(mention)

    report.duration_seconds = time.time() - t_start
    return report


def report_to_text(report: IdentifyReport) -> str:
    """Format texte humain du rapport identify."""
    stats = report.stats()
    lines = [
        f"=== Identify report : {report.sota_path.name} ===",
        f"Duration: {report.duration_seconds:.1f}s",
        f"Citations: {stats['citations_total']}",
        f"  DOI resolved: {stats['doi_resolved']}  "
        f"(by_doi: {stats['matched_by_doi']}, "
        f"by_fuzzy: {stats['matched_by_fuzzy']})",
        f"  Reuse: {stats['n_reuse']}  |  Create: {stats['n_create']}  |  "
        f"Low conf skipped: {stats['n_skipped_low']}",
    ]
    if stats["n_reuse_retracted"]:
        lines.append(
            f"  WARN — wikilinks vers retracted: {stats['n_reuse_retracted']}"
        )
    if stats["n_orphan_pdf"]:
        lines.append(f"  Orphan PDFs found: {stats['n_orphan_pdf']}")

    by_action: dict[str, list] = {}
    for m in report.mentions:
        by_action.setdefault(m.action_recommended, []).append(m)

    for action_key in ("reuse", "reuse_retracted", "create",
                       "skipped_low_confidence"):
        items = by_action.get(action_key, [])
        if not items:
            continue
        lines.append(f"\n{action_key.upper()} ({len(items)}) :")
        for m in items[:15]:
            slug_info = m.matched_slug or m.would_create_slug or "?"
            state_info = f"[{m.slug_state}]" if m.slug_state else ""
            pdf_info = "[PDF]" if m.slug_has_pdf else "[   ]"
            orph = (f" orphan={m.orphan_pdf_match}"
                    if m.orphan_pdf_match else "")
            lines.append(f"  {state_info:<22}{pdf_info} {slug_info}{orph}")
            lines.append(
                f"      {(m.author or '')[:60]} ({m.year}) "
                f"— {(m.title or '')[:60]}"
            )

    if report.errors:
        lines.append(f"\nErrors ({len(report.errors)}) :")
        for e in report.errors[:5]:
            lines.append(f"  {e}")

    return "\n".join(lines)
