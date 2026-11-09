"""Module linkify — insère les wikilinks finaux dans un SOTA.

Pour chaque mention identifiée :
- Si la ref est validée avec PDF (state=page1_validated|sota_cited_confirmed
  ET pdf_path présent) → wikilink direct vers le PDF.
- Sinon → wikilink vers une ancre `#source-<lastname>-<year>` dans une
  section `## Statut des sources` régénérée idempotemment en bas du SOTA.

La section Statut est encadrée par les marqueurs HTML
`<!-- paper-trail:statut:begin -->` / `:end -->` pour permettre la
régénération propre (`re.DOTALL` strip + rewrite).

Phase 5 du plan refonte INGEST.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# Marqueurs idempotents
STATUT_BEGIN = "<!-- paper-trail:statut:begin -->"
STATUT_END = "<!-- paper-trail:statut:end -->"
STATUT_HEADING = "## Statut des sources"

# Sections H2 obsolètes (anciens templates) à supprimer par linkify.
# La section Statut auto-générée les remplace.
OBSOLETE_SECTION_PATTERNS = [
    re.compile(r"^## Liste finale des références.*$", re.IGNORECASE),
    re.compile(r"^## Suite\s*$", re.IGNORECASE),
]

# Mapping (state effectif) → libellé court pour l'utilisateur.
# Format minimaliste : une seule ligne par ref, status humain, sans
# métadonnées techniques.
STATUT_LABELS = {
    "validated": "DL + validée",
    "in_progress": "en attente d'acquisition",
    "blocked": "bloquée (humain)",
    "retracted": "rétractée",
    "missing": "ref pas encore créée",
}


@dataclass
class StatutEntry:
    """Une entrée de la section ## Statut des sources."""
    slug: Optional[str]
    anchor: str
    lastname: str
    year: str
    title: str
    state: str
    reason: str
    pdf_path: Optional[str] = None
    category: str = "missing"


@dataclass
class LinkifyResult:
    sota_path: Path
    n_pdf_wikilinks: int = 0
    n_anchor_wikilinks: int = 0
    statut_entries: list[StatutEntry] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def total_substitutions(self) -> int:
        return self.n_pdf_wikilinks + self.n_anchor_wikilinks


def _make_anchor(lastname: str, year: str) -> str:
    """Génère une ancre stable pour la section Statut.

    Idempotent : même (lastname, year) → même ancre.
    """
    lname = re.sub(r"[^a-z0-9]", "", (lastname or "").lower()) or "unknown"
    yr = re.sub(r"[^0-9]", "", year or "")[:4] or "0000"
    return f"source-{lname}-{yr}"


def _classify_entry(state: Optional[str]) -> str:
    """Classe une entrée dans une des 5 catégories Statut."""
    if not state or state == "not_yet_created":
        return "missing"
    if state == "retracted":
        return "retracted"
    if state in ("page1_validated", "sota_cited_confirmed"):
        return "validated"
    if state.startswith("blocked_human"):
        return "blocked"
    # candidate, uid_resolved, pdf_acquired, awaiting_rtfm_ocr, needs_reacquisition
    return "in_progress"


def _strip_existing_statut(text: str) -> str:
    """Retire la section Statut existante (entre marqueurs) si présente."""
    pattern = re.compile(
        re.escape(STATUT_BEGIN) + r".*?" + re.escape(STATUT_END),
        flags=re.DOTALL,
    )
    return pattern.sub("", text).rstrip() + "\n"


def _strip_obsolete_sections(text: str) -> str:
    """Retire les sections H2 obsolètes (anciens templates de gestion des
    sources) que la section Statut auto-générée remplace.

    Une section H2 va du `## Heading` (inclus) jusqu'au prochain `## `
    (exclu) ou à la fin du fichier.
    """
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Si la ligne matche un pattern obsolète, skip jusqu'au prochain
        # heading H2 (ou fin de fichier).
        if any(p.match(line) for p in OBSOLETE_SECTION_PATTERNS):
            # Cherche le prochain heading H2 ou H1
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                if re.match(r"^#{1,2}\s+", nxt) and not any(
                    p.match(nxt) for p in OBSOLETE_SECTION_PATTERNS
                ):
                    break
                j += 1
            # Retire les lignes vides en queue avant le prochain heading
            # pour ne pas laisser un trou.
            i = j
            continue
        out.append(line)
        i += 1
    # Nettoie les blancs multiples consécutifs résiduels
    result = "\n".join(out)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result


def build_statut_section(entries: list[StatutEntry]) -> str:
    """Génère la section Statut en format minimaliste.

    Une ligne par ref :
      `- <Auteur> <année> — <status court>  ^source-<lastname>-<year>`

    Le `^source-...` en fin de ligne est une block-ref Obsidian
    standard, ciblable par un wikilink `[[fichier#^source-foo-2020]]`.
    Idempotent (régénéré entre les marqueurs HTML).
    """
    lines = [STATUT_BEGIN, "", STATUT_HEADING, ""]

    # Tri stable : par catégorie (validated → in_progress → blocked →
    # retracted → missing) puis par lastname/year.
    cat_order = ["validated", "in_progress", "blocked", "retracted", "missing"]
    sorted_entries = sorted(
        entries,
        key=lambda e: (
            cat_order.index(e.category) if e.category in cat_order else 99,
            e.lastname.lower(),
            e.year,
        ),
    )

    for e in sorted_entries:
        # Status court humain (libellé par catégorie + précision si dispo)
        label = STATUT_LABELS.get(e.category, e.state)
        if e.category == "retracted" and e.reason.startswith("merged_into:"):
            target = e.reason.split(":", 1)[1].strip()
            label = f"rétractée (utilise [[{target}]])"
        elif e.category == "blocked" and e.reason:
            # extrait raison courte si dispo
            label = f"bloquée — {e.reason[:60]}"

        # Auteur + année concis
        author_short = f"{e.lastname} {e.year}".strip()
        lines.append(f"- {author_short} — {label}  ^{e.anchor}")

    lines.append("")
    lines.append(STATUT_END)
    return "\n".join(lines)


def _substitute_with_anchor(
    sota_path: Path, citation, anchor: str,
    lastname: str, year: str,
) -> bool:
    """Substitue dans le SOTA un wikilink `[[#anchor|lastname_year]]` devant
    le raw de la citation (Tier 1 strict uniquement — si raw n'est pas
    littéral, on rate ; mais avec citation-parser v2 c'est OK).
    """
    from .ingest import _line_already_has_lastname_wikilink

    try:
        text = sota_path.read_text(encoding="utf-8")
    except OSError:
        return False

    raw = (citation.raw or "").strip()
    if not raw or raw not in text:
        return False

    # Block-ref Obsidian : `[[#^source-foo-2020|alias]]` pointe vers la
    # ligne marquée `^source-foo-2020` (vs `<a id>` HTML qui ne marche
    # pas avec les wikilinks Obsidian).
    wikilink = f"[[#^{anchor}|{lastname.lower()}_{year or '0000'}]]"
    lastname_anorm = re.sub(r"[^a-z0-9]", "", (lastname or "").lower())

    new_lines = []
    any_subst = False
    for line in text.split("\n"):
        if (raw in line and not _line_already_has_lastname_wikilink(
                line, lastname_anorm)):
            new_lines.append(line.replace(raw, f"{wikilink} — {raw}", 1))
            any_subst = True
        else:
            new_lines.append(line)
    if any_subst:
        sota_path.write_text("\n".join(new_lines), encoding="utf-8")
        return True
    return False


def linkify_sota(
    sota_path: Path, identify_report, apply: bool = False,
) -> LinkifyResult:
    """Insère les wikilinks finaux + régénère la section Statut.

    Args:
        sota_path: chemin du SOTA
        identify_report: IdentifyReport produit par identify.identify_sota
        apply: True = mute le SOTA, False = compte uniquement (dry-run)
    """
    from .ingest import (
        ParsedCitation, _substitute_to_wikilink,
        _extract_first_author_lastname,
    )
    from .registry import load_ref
    from .config import REFS

    result = LinkifyResult(sota_path=sota_path)
    entries_by_anchor: dict[str, StatutEntry] = {}

    for mention in identify_report.mentions:
        if mention.action_recommended == "skipped_low_confidence":
            continue
        slug = mention.matched_slug or mention.would_create_slug
        if not slug:
            continue

        ref = None
        ref_path = REFS / f"{slug}.md"
        if ref_path.exists():
            ref = load_ref(ref_path)

        state = ref.frontmatter.get("state") if ref else None
        has_pdf = bool(ref and ref.frontmatter.get("pdf_path"))
        pdf_path = ref.frontmatter.get("pdf_path") if ref else None
        is_validated = state in ("page1_validated", "sota_cited_confirmed")

        cit = ParsedCitation(
            author=mention.author, year=mention.year,
            title=mention.title, raw=mention.raw,
            confidence=mention.confidence,
        )

        if is_validated and has_pdf:
            # Cas A : wikilink direct PDF
            if apply and _substitute_to_wikilink(sota_path, cit, slug):
                result.n_pdf_wikilinks += 1
        else:
            # Cas B : wikilink vers ancre Statut + entry
            lastname = (
                _extract_first_author_lastname(mention.author).capitalize()
                or "Unknown"
            )
            anchor = _make_anchor(lastname, mention.year)
            reason = "ref pas encore créée"
            if state == "retracted" and ref:
                rr = ref.frontmatter.get("retracted_reason", "") or ""
                reason = f"retracted: {rr}" if rr else "retracted"
            elif state and state.startswith("blocked_human"):
                br = (ref.frontmatter.get("blocked_reason", "")
                      if ref else "")
                reason = (f"{state.split(':', 1)[-1]} — {br}"
                          if br else state)
            elif state == "awaiting_rtfm_ocr":
                reason = "OCR RTFM en attente"
            elif state:
                reason = f"state={state}"

            entry = StatutEntry(
                slug=slug if ref else None,
                anchor=anchor,
                lastname=lastname,
                year=mention.year or "0000",
                title=mention.title or "",
                state=state or "not_yet_created",
                reason=reason,
                pdf_path=pdf_path,
                category=_classify_entry(state),
            )
            entries_by_anchor[anchor] = entry  # dedup par ancre

            if apply:
                if _substitute_with_anchor(
                    sota_path, cit, anchor, lastname, mention.year
                ):
                    result.n_anchor_wikilinks += 1

    result.statut_entries = list(entries_by_anchor.values())

    if apply and result.statut_entries:
        try:
            text = sota_path.read_text(encoding="utf-8")
            text = _strip_existing_statut(text)
            text = _strip_obsolete_sections(text)
            statut_md = build_statut_section(result.statut_entries)
            text = text.rstrip() + "\n\n" + statut_md + "\n"
            sota_path.write_text(text, encoding="utf-8")
        except OSError as e:
            result.errors.append(f"write statut: {e}")

    return result
