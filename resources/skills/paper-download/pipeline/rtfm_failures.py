"""Wrapper Python autour de `rtfm failed` et `rtfm check` (Couche 5).

Sert à la corrélation entre les échecs RTFM et nos invariants doctor :
  - `list_failures()` : liste plate des jobs en échec (ingest, ocr, embed, …)
    via `rtfm failed -f json`.
  - `check_ref(ref)` : appel `rtfm check --path <pdf>` qui retourne le JSON
    brut (le wrapper `rtfm_helper.rtfm_check_path` est réutilisé).

Schéma observé `rtfm failed -f json` (cf. rtfm/cli.py::cmd_failed lignes 406-484) :
  {
    "total": int,
    "failures": [
      {
        "id":         int,         # id work_queue
        "type":       str,         # "ingest" | "ocr" | "embed" | "scan" | ...
        "filepath":   str | None,  # absolu (depuis payload.filepath)
        "corpus":     str | None,
        "bucket":     str,         # cf. _failure_bucket() ci-dessous
        "error":      str,         # première ligne, tronquée 300 chars
        "finished_at": str         # ISO timestamp
      },
      ...
    ]
  }

Buckets observés (cf. rtfm/cli.py::_failure_bucket) :
  pdf-format-invalid, file-vanished, duplicate-content, memory-exceeded,
  pdftext-other, ocr-tesseract-error, other, unknown.

Exit codes `rtfm failed` : 0 si vide, 1 sinon (mais JSON est toujours sur
stdout dans les deux cas).

Toute erreur d'appel CLI (rtfm absent, crash, timeout, JSON corrompu) est
absorbée : retour `[]` / `None` + warning stderr. Ne casse pas doctor.
"""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .config import RTFM_DB
from .registry import Ref


@dataclass
class RtfmFailure:
    """Un échec RTFM retourné par `rtfm failed -f json`."""
    type: str                # "ingest" / "ocr" / "embed" / "scan" / "remove" / etc.
    filepath: str | None     # chemin absolu (peut être None si payload incomplet)
    bucket: str              # pdf-format-invalid, file-vanished, etc.
    error: str               # message tronqué 300 chars
    corpus: str | None
    job_id: int | None = None
    finished_at: str | None = None

    @classmethod
    def from_json(cls, d: dict) -> "RtfmFailure":
        return cls(
            type=d.get("type", "unknown"),
            filepath=d.get("filepath"),
            bucket=d.get("bucket", "unknown"),
            error=d.get("error", ""),
            corpus=d.get("corpus"),
            job_id=d.get("id"),
            finished_at=d.get("finished_at"),
        )


def _rtfm_available() -> bool:
    """True si `rtfm` est sur le PATH."""
    return shutil.which("rtfm") is not None


def _warn(msg: str) -> None:
    print(f"[rtfm_failures] WARN: {msg}", file=sys.stderr)


def list_failures(
    types: list[str] | None = None,
    buckets: list[str] | None = None,
    corpus: str | None = None,
    limit: int = 1000,
    timeout: int = 30,
) -> list[RtfmFailure]:
    """Liste plate des échecs RTFM via `rtfm failed -f json`.

    Args:
      types: filtre côté Python sur le champ `type` (rtfm CLI ne supporte qu'un
        seul `--type`, on fait le filtre nous-mêmes pour autoriser multiples).
      buckets: filtre côté Python sur le champ `bucket`.
      corpus: filtre côté CLI (passé via `--corpus`).
      limit: cap dur côté CLI (défaut 1000, équivalent du CLI).

    Retourne `[]` si :
      - `rtfm` n'est pas installé,
      - le subprocess crashe / timeout,
      - le JSON est invalide,
      - aucun échec.
    """
    if not _rtfm_available():
        _warn("commande `rtfm` introuvable sur le PATH — checks RTFM ignorés")
        return []

    cmd = ["rtfm", "failed", "--db", str(RTFM_DB),
           "-f", "json", "--limit", str(limit)]
    if corpus:
        cmd.extend(["--corpus", corpus])

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        _warn(f"crash subprocess `rtfm failed` : {type(e).__name__}: {e}")
        return []

    # rtfm failed exit 0 = pas d'échecs, exit 1 = échecs présents (JSON toujours valide)
    if proc.returncode not in (0, 1):
        _warn(f"rtfm failed exit code inattendu {proc.returncode} : "
              f"{(proc.stderr or '')[:200]}")
        return []

    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as e:
        _warn(f"JSON `rtfm failed` invalide : {e} ; "
              f"head={(proc.stdout or '')[:200]}")
        return []

    raw = data.get("failures") or []
    failures = [RtfmFailure.from_json(d) for d in raw if isinstance(d, dict)]

    # Filtres post-CLI (types et buckets en liste — rtfm CLI ne fait qu'un seul)
    if types:
        types_set = set(types)
        failures = [f for f in failures if f.type in types_set]
    if buckets:
        buckets_set = set(buckets)
        failures = [f for f in failures if f.bucket in buckets_set]

    return failures


def check_ref(ref: Ref, timeout: int = 15) -> dict | None:
    """Appel `rtfm check --path <pdf>` et retourne le JSON brut.

    Réutilise `rtfm_helper.rtfm_check_path`. Si la ref n'a pas de `pdf_path`,
    ou si `rtfm` est indisponible, retourne `None`.

    Le JSON retourné a la forme (cf. rtfm/cli.py::cmd_check) :
      { "query": str, "matches": int, "books": [ {slug, filename, chunks,
        ingest_failure_reason, ingest_failure_error,
        ocr_failure_reason, ocr_failure_error, ...}, ... ] }
    """
    if not _rtfm_available():
        return None
    pdf_abs = ref.pdf_path_abs
    if pdf_abs is None or not pdf_abs.exists():
        return None
    try:
        from .rtfm_helper import rtfm_check_path
        return rtfm_check_path(pdf_abs, timeout=timeout)
    except Exception as e:
        _warn(f"check_ref({ref.slug}) crash : {type(e).__name__}: {e}")
        return None


def find_failure_for_path(failures: list[RtfmFailure],
                          pdf_path: str | Path) -> RtfmFailure | None:
    """Trouve un échec RTFM correspondant à un chemin PDF (absolu ou relatif).

    Le matching est tolérant : on compare le nom de fichier (basename) ET
    le suffixe de chemin pour gérer le cas où RTFM aurait un chemin
    relatif à un répertoire différent du nôtre.
    """
    if not pdf_path:
        return None
    target = Path(pdf_path)
    target_name = target.name
    target_str = str(target)
    for f in failures:
        if not f.filepath:
            continue
        fp = Path(f.filepath)
        # Match strict d'abord (chemin exact)
        if f.filepath == target_str:
            return f
        # Match par basename si chemins divergent (worktrees, symlinks)
        if fp.name == target_name:
            return f
    return None


def is_pdf_image_only(pdf_path: str | Path, timeout: int = 30,
                     text_threshold: int = 100) -> bool | None:
    """Détecte si un PDF n'a pas de couche texte extractible.

    Utilise `pdftotext` (poppler-utils) : si `pdftotext <pdf> -` produit
    moins de `text_threshold` caractères, on considère le PDF image-only.

    Retourne :
      True  : image-only (pas de texte extractible)
      False : a une couche texte exploitable
      None  : impossible à déterminer (pdftotext absent, fichier illisible,
              timeout)
    """
    if not shutil.which("pdftotext"):
        return None
    p = Path(pdf_path)
    if not p.exists() or not p.is_file():
        return None
    try:
        proc = subprocess.run(
            ["pdftotext", "-q", str(p), "-"],
            capture_output=True, text=True,
            timeout=timeout, check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        # pdftotext peut crash sur des PDFs corrompus — ce n'est pas une
        # info fiable sur "image-only"
        return None
    extracted = (proc.stdout or "").strip()
    return len(extracted) < text_threshold
