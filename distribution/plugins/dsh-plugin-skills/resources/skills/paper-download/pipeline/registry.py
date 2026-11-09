"""Chargement / mutation atomique des fichiers refs du registry."""
from __future__ import annotations
import os
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from .config import REFS, SOURCES


class RegistryWriteCorrupted(RuntimeError):
    """Levée si le re-parse post-write d'un fichier ref échoue ou diverge.

    Indique une anomalie sévère (bug du dumper, FS truncation inattendue).
    Le worker doit s'arrêter et l'humain doit investiguer — pas de tentative
    de réparation automatique (`os.replace` est censé être atomique).
    """

    def __init__(self, path: Path, reason: str) -> None:
        self.path = path
        self.reason = reason
        super().__init__(f"{path}: {reason}")


@dataclass
class Ref:
    """Une référence du registry."""
    slug: str
    path: Path
    frontmatter: dict[str, Any]
    body: str

    @property
    def state(self) -> str:
        return self.frontmatter.get("state", "candidate")

    @property
    def uid(self) -> str | None:
        return self.frontmatter.get("uid")

    @property
    def pdf_path_abs(self) -> Path | None:
        pp = self.frontmatter.get("pdf_path")
        if not pp:
            return None
        p = Path(pp)
        return p if p.is_absolute() else (SOURCES / pp)

    @property
    def cited_in(self) -> list[dict]:
        return self.frontmatter.get("cited_in") or []


def parse_frontmatter_md(text: str) -> tuple[dict | None, str]:
    """Parse un fichier .md avec frontmatter YAML séparateur `---`.

    Retourne (frontmatter_dict, body) ou (None, text) si parse impossible.
    """
    fm, _err, body = parse_frontmatter_md_verbose(text)
    return fm, body


def parse_frontmatter_md_verbose(text: str) -> tuple[dict | None, str, str]:
    """Comme `parse_frontmatter_md`, mais rend aussi la raison de l'échec.

    Retourne (frontmatter, raison_ou_chaîne_vide, body). Une fiche illisible
    disparaissait sans bruit des passages : la raison permet de la nommer.
    """
    if not text.startswith("---"):
        return None, "no frontmatter delimiter", text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return None, "unterminated frontmatter block", text
    try:
        return yaml.safe_load(parts[1]) or {}, "", parts[2]
    except yaml.YAMLError as e:
        detail = " ".join(str(e).split())
        return None, f"invalid YAML: {detail[:200]}", text


def load_ref(path: Path) -> Ref | None:
    """Charge une ref depuis son fichier .md. Renvoie None si parse échoue."""
    ref, _why = load_ref_verbose(path)
    return ref


def load_ref_verbose(path: Path) -> tuple[Ref | None, str]:
    """Charge une ref et rend la raison de l'échec plutôt que `None` seul."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return None, f"unreadable file: {e.strerror or e}"
    fm, why, body = parse_frontmatter_md_verbose(text)
    if fm is None:
        return None, why
    if not isinstance(fm, dict):
        return None, f"frontmatter is {type(fm).__name__}, expected a mapping"
    return Ref(slug=path.stem, path=path, frontmatter=fm, body=body), ""


def iter_refs(refs_dir: Path | None = None):
    """Itère sur toutes les refs du registry.

    Si `refs_dir` est None, lit la valeur courante de `config.REFS` au
    runtime (permet aux tests de patcher config.REFS sans buter sur le
    piège des defaults Python évalués à la définition).
    """
    if refs_dir is None:
        from .config import REFS as _REFS
        refs_dir = _REFS
    for p in sorted(refs_dir.glob("*.md")):
        ref, why = load_ref_verbose(p)
        if ref is not None:
            yield ref
        else:
            # Une fiche illisible était sautée sans un mot : la référence
            # disparaissait des passages sans que personne ne s'en aperçoive.
            print(f"[registry] SKIPPED unreadable ref {p.stem} — {why}",
                  file=sys.stderr)


def save_ref(ref: Ref) -> None:
    """Écrit la ref atomiquement (tempfile + os.replace), puis re-parse.

    Le body est préservé tel quel. Le frontmatter est re-dumpé en YAML.

    Post-write validation :
      1. Re-lit le fichier après `os.replace`.
      2. Re-parse le frontmatter. Si parse impossible → RegistryWriteCorrupted.
      3. Vérifie que `state` lu == `state` qu'on a écrit → sinon corruption.

    Pas de backup ni de tentative de réparation : `os.replace` est atomique
    sur ext4/NTFS/drvfs. Si le re-parse échoue, c'est un bug du dumper PyYAML
    (donc déterministe — pas un crash transient).
    """
    fm_yaml = yaml.safe_dump(
        ref.frontmatter,
        sort_keys=True,
        allow_unicode=True,
        default_flow_style=False,
        width=120,
    )
    content = f"---\n{fm_yaml}---{ref.body}"
    dir_ = ref.path.parent
    fd, tmp = tempfile.mkstemp(dir=dir_, prefix=ref.path.stem + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, ref.path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

    # Post-write validation : re-lire et re-parser ce qu'on vient d'écrire.
    try:
        reread = ref.path.read_text(encoding="utf-8")
    except OSError as e:
        raise RegistryWriteCorrupted(
            ref.path, f"post_write_read_failed:{type(e).__name__}"
        ) from e
    fm_back, _body_back = parse_frontmatter_md(reread)
    if fm_back is None:
        raise RegistryWriteCorrupted(
            ref.path, "post_write_yaml_unparseable"
        )
    expected_state = ref.frontmatter.get("state")
    actual_state = fm_back.get("state")
    if actual_state != expected_state:
        raise RegistryWriteCorrupted(
            ref.path,
            f"state_field_mismatch_post_write "
            f"(expected={expected_state!r}, got={actual_state!r})",
        )


def append_state_history(ref: Ref, new_state: str, by: str, meta: dict | None = None) -> None:
    """Ajoute une entrée state_history et met à jour state. Mutation in-place."""
    hist = ref.frontmatter.setdefault("state_history", [])
    entry: dict[str, Any] = {
        "state": new_state,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "by": by,
    }
    if meta:
        entry["meta"] = meta
    hist.append(entry)
    ref.frontmatter["state"] = new_state


def append_acquisition_attempt(
    ref: Ref, source: str, verdict: str, info: dict | None = None
) -> int:
    """Ajoute une entrée acquisition_attempts. Retourne le nouveau numéro."""
    attempts = ref.frontmatter.setdefault("acquisition_attempts", [])
    n = len(attempts) + 1
    entry: dict[str, Any] = {
        "n": n,
        "source": source,
        "verdict": verdict,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
    }
    if info:
        entry.update(info)
    attempts.append(entry)
    return n
