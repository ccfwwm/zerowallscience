"""Call the bundled paper-download pipeline for one literature record."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class PaperDownloadResult:
    ok: bool
    status: str
    path: str = ""
    source: str = "paper-download"
    work_dir: str = ""
    stdout: str = ""
    stderr: str = ""


def paper_download_root() -> Path | None:
    """Resolve the bundled or user-installed paper-download skill."""
    candidates = []
    configured = os.environ.get("ZEROWALL_PAPER_DOWNLOAD_ROOT", "").strip()
    if configured:
        candidates.append(Path(configured))
    here = Path(__file__).resolve()
    candidates.extend([
        here.parents[2] / "paper-download",
        Path.cwd() / "resources" / "skills" / "paper-download",
        Path.home() / ".codex" / "skills" / "paper-download",
    ])
    for candidate in candidates:
        if (candidate / "pipeline" / "__main__.py").is_file():
            return candidate
    return None


def _safe_slug(paper: dict[str, Any]) -> str:
    raw = str(paper.get("doi") or paper.get("pmid") or paper.get("title") or "paper")
    value = "".join(ch.lower() if ch.isalnum() else "_" for ch in raw)
    return value.strip("_")[:90] or "paper"


def _frontmatter(paper: dict[str, Any], slug: str) -> str:
    authors = paper.get("authors") or []
    author = str(authors[0] if authors else paper.get("author") or "Unknown")
    title = str(paper.get("title") or "Untitled")
    year = str(paper.get("year") or "")
    doi = str(paper.get("doi") or "").strip()
    uid = f"doi:{doi}" if doi else f"bibkey:{slug}"
    lines = [
        "---",
        f"author: {json.dumps(author, ensure_ascii=False)}",
        f"title: {json.dumps(title, ensure_ascii=False)}",
        f"year: {json.dumps(year, ensure_ascii=False)}",
        f"uid: {json.dumps(uid, ensure_ascii=False)}",
        "state: candidate",
        "state_history: []",
        "acquisition_attempts: []",
        "---",
        "",
    ]
    return "\n".join(lines)


def _find_pdf(root: Path, slug: str) -> Path | None:
    files = [p for p in root.rglob("*.pdf") if p.is_file()]
    if not files:
        return None
    preferred = [p for p in files if slug in p.name.lower()]
    return max(preferred or files, key=lambda p: p.stat().st_mtime)


def download_with_paper_download(
    paper: dict[str, Any],
    target: Path,
    work_dir: Path,
    *,
    allow_shadow: bool = True,
    timeout: float = 30.0,
) -> PaperDownloadResult:
    """Run paper-download's native FSM in an isolated task directory."""
    root = paper_download_root()
    if root is None:
        return PaperDownloadResult(False, "paper_download_missing", work_dir=str(work_dir))
    # Every paper owns a private bridge directory.  The caller may run many
    # downloads concurrently; sharing registry/vault/log files corrupts the
    # upstream FSM and makes later audits non-deterministic.
    work_dir = (work_dir / _safe_slug(paper)).resolve()
    vault = work_dir / "vault"
    sources = work_dir / "sources"
    registry = work_dir / "registry"
    refs = registry / "refs"
    refs.mkdir(parents=True, exist_ok=True)
    sources.mkdir(parents=True, exist_ok=True)
    slug = _safe_slug(paper)
    (refs / f"{slug}.md").write_text(_frontmatter(paper, slug), encoding="utf-8")

    env = os.environ.copy()
    # Standalone bridge jobs use a private registry; provider credentials and
    # user preferences still come from ZeroWall Environment process variables.
    env.update({
        "RESEARCH_VAULT_PATH": str(vault),
        "RESEARCH_SOURCES_PATH": str(sources),
        "RESEARCH_REGISTRY_PATH": str(registry),
    })
    # The literature workflow opts into the extended paper-download cascade
    # by default.  Callers can still explicitly disable it for a run.
    if allow_shadow:
        env["RESEARCH_ENABLE_SHADOW_LIBS"] = "1"
    else:
        env.pop("RESEARCH_ENABLE_SHADOW_LIBS", None)
    command = [sys.executable, "-m", "pipeline", "run", "--ref", slug,
               "--loop", "--max-iterations", "8", "--no-lint", "--no-doctor"]
    try:
        completed = subprocess.run(
            command,
            cwd=str(root),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(30.0, timeout * 8),
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        work_dir.mkdir(parents=True, exist_ok=True)
        stdout = str(exc.stdout or "")[-12000:]
        stderr = str(exc.stderr or "")[-12000:]
        (work_dir / "bridge.stdout.log").write_text(stdout, encoding="utf-8")
        (work_dir / "bridge.stderr.log").write_text(stderr, encoding="utf-8")
        (work_dir / "bridge.result.json").write_text(json.dumps({"returncode": None, "pdf": None, "status": "paper_download_timeout", "allow_shadow": allow_shadow, "slug": slug}, ensure_ascii=False, indent=2), encoding="utf-8")
        return PaperDownloadResult(False, "paper_download_timeout", work_dir=str(work_dir), stdout=stdout[-4000:], stderr=stderr[-4000:])
    pdf = _find_pdf(sources, slug)
    work_dir.mkdir(parents=True, exist_ok=True)
    (work_dir / "bridge.stdout.log").write_text(completed.stdout[-12000:], encoding="utf-8")
    (work_dir / "bridge.stderr.log").write_text(completed.stderr[-12000:], encoding="utf-8")
    (work_dir / "bridge.result.json").write_text(json.dumps({
        "returncode": completed.returncode,
        "pdf": str(pdf) if pdf else None,
        "allow_shadow": allow_shadow,
        "slug": slug,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    if completed.returncode != 0 or pdf is None:
        status = "paper_download_failed" if completed.returncode else "paper_download_no_pdf"
        return PaperDownloadResult(False, status, work_dir=str(work_dir), stdout=completed.stdout[-4000:], stderr=completed.stderr[-4000:])
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pdf, target)
    return PaperDownloadResult(True, "downloaded_paper_download", path=str(target), work_dir=str(work_dir), stdout=completed.stdout[-4000:], stderr=completed.stderr[-4000:])
