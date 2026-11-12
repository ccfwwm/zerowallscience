"""Sci-Hub multi-mirror — source d'acquisition opt-in.

Extrait de pipeline/cascade.py (try_scihub, lignes 394-413).
Activation : variable d'environnement RESEARCH_ENABLE_SHADOW_LIBS=1.

L'utilisation de Sci-Hub peut violer le droit d'auteur dans votre
juridiction. Cf. DISCLAIMER.md à la racine du plugin.
"""
from __future__ import annotations
import tempfile
from pathlib import Path

from pipeline.registry import Ref


def try_scihub(ref: Ref) -> tuple[str, dict]:
    """Résolution PDF via Sci-Hub multi-mirror (helper lib/s2_resolver).

    Retourne :
      - ("success", {pdf_path, pdf_sha256, size_kb}) si page 1 valide
      - ("page1_failed", {reason, quarantine}) si page 1 KO
      - ("failed", {reason}) si pas de DOI ou pas de PDF
      - ("no_source", ...) si pas de DOI dans la ref
    """
    # Lazy import pour éviter tout cycle au module-load
    from pipeline.cascade import _doi, _save_and_validate

    doi = _doi(ref)
    if not doi:
        return "no_source", {"reason": "no_doi"}
    tmp = Path(tempfile.mkstemp(suffix=".pdf", prefix="scihub_")[1])
    try:
        from s2_resolver import try_scihub as helper_scihub
        ok = helper_scihub(doi, tmp)
        if not ok or not tmp.exists() or tmp.stat().st_size < 3000:
            return "failed", {"reason": "scihub_no_pdf"}
        data = tmp.read_bytes()
    except Exception as e:
        return "failed", {"reason": f"scihub_helper:{type(e).__name__}"}
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
    return _save_and_validate(data, ref)
