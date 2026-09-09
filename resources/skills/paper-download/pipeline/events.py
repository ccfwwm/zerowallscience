"""Lecture filtrée du journal JSONL des transitions (Couche 3 — plan-design §4).

Le journal est append-only, écrit par `journal.append_event` /
`journal.append_blocked`. Un fichier par jour UTC :
    <JOURNAL>/YYYY-MM-DD.jsonl

Chaque ligne est un JSON avec le schéma :
    {
      "ts":   "2026-05-24T15:32:04Z",   # ISO Z
      "ref":  "<slug>",
      "from": "<state>" | null,
      "to":   "<state>" | null,
      "via":  "<source/raison>",
      "meta": { ... }                    # optionnel
    }

Ce module n'écrit jamais — uniquement lecture + filtrage.
"""
from __future__ import annotations
import json
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Iterator

from .config import JOURNAL, REFS
from .registry import iter_refs


def _parse_iso_date(s: str) -> date:
    """Parse 'YYYY-MM-DD' (ou ISO date) → date. Lève ValueError."""
    # Accept full datetime ISO or date-only.
    return datetime.fromisoformat(s.replace("Z", "+00:00")).date()


def _event_ts_date(event_ts: str) -> date | None:
    """Extrait la date d'un ts d'événement ('2026-05-24T...Z')."""
    try:
        return datetime.fromisoformat(event_ts.replace("Z", "+00:00")).date()
    except (ValueError, AttributeError):
        return None


def iter_journal_files(journal_dir: Path = JOURNAL) -> list[Path]:
    """Liste triée des fichiers .jsonl du journal (un par jour UTC)."""
    if not journal_dir.exists():
        return []
    return sorted(journal_dir.glob("*.jsonl"))


def iter_events(
    journal_dir: Path = JOURNAL,
    since: date | None = None,
) -> Iterator[dict]:
    """Itère sur tous les événements du journal, optionnellement filtrés par date.

    `since` : date inclusive (jour UTC). Les fichiers strictement antérieurs
    sont ignorés ; au sein d'un fichier, on filtre aussi par `ts`.
    """
    for fp in iter_journal_files(journal_dir):
        # Optimisation : skip les fichiers dont le nom est antérieur à `since`.
        if since is not None:
            try:
                file_date = _parse_iso_date(fp.stem)
            except ValueError:
                file_date = None
            if file_date is not None and file_date < since:
                continue
        try:
            content = fp.read_text(encoding="utf-8")
        except OSError:
            continue
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            if since is not None:
                ev_date = _event_ts_date(ev.get("ts", ""))
                if ev_date is None or ev_date < since:
                    continue
            yield ev


def refs_cited_in(
    sota_name: str,
    refs_dir: Path = REFS,
) -> set[str]:
    """Retourne l'ensemble des slugs dont `cited_in[].name == sota_name`."""
    out: set[str] = set()
    for ref in iter_refs(refs_dir):
        for c in ref.cited_in:
            if isinstance(c, dict) and c.get("name") == sota_name:
                out.add(ref.slug)
                break
    return out


def filter_events(
    events: Iterable[dict],
    to_state: str | None = None,
    cited_in: str | None = None,
    refs_dir: Path = REFS,
) -> list[dict]:
    """Filtre une séquence d'événements par état cible et/ou SOTA citant.

    - `to_state` : ne garde que les events dont `to == to_state`.
    - `cited_in` : intersection avec les refs dont `cited_in[].name == cited_in`.
    """
    citing: set[str] | None = None
    if cited_in is not None:
        citing = refs_cited_in(cited_in, refs_dir=refs_dir)

    out: list[dict] = []
    for ev in events:
        if to_state is not None and ev.get("to") != to_state:
            continue
        if citing is not None and ev.get("ref") not in citing:
            continue
        out.append(ev)
    return out


def format_event_line(ev: dict) -> str:
    """Formate un événement en ligne texte humaine."""
    ts = ev.get("ts", "?")
    ref = ev.get("ref", "?")
    frm = ev.get("from")
    to = ev.get("to")
    via = ev.get("via", "?")
    arrow = f"{frm} → {to}"
    return f"{ts}  {ref:<55}  {arrow:<45}  via={via}"


def render_text(
    events: list[dict],
    since: date | None,
    to_state: str | None,
    cited_in: str | None,
) -> str:
    """Rendu humain (header + lignes + récap)."""
    lines: list[str] = []
    filters = []
    if since is not None:
        filters.append(f"since={since.isoformat()}")
    if to_state is not None:
        filters.append(f"to={to_state}")
    if cited_in is not None:
        filters.append(f"cited-in={cited_in}")
    header = "# Events"
    if filters:
        header += " (" + ", ".join(filters) + ")"
    lines.append(header)
    lines.append("")
    for ev in events:
        lines.append(format_event_line(ev))
    lines.append("")
    n_refs = len({ev.get("ref") for ev in events if ev.get("ref")})
    lines.append(f"Total events: {len(events)}  —  distinct refs: {n_refs}")
    return "\n".join(lines)
