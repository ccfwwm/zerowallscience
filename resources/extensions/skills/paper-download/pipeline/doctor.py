"""Pipeline doctor — orchestrateur des invariants I1-I15.

API publique :
  - Violation (dataclass)
  - run_all_checks(refs) -> list[Violation]
  - auto_fix(violations) -> tuple[int, int]  # (fixed, skipped)
  - format_report_markdown(violations) -> str
  - format_report_json(violations) -> str

CLI : cf. cli.py `cmd_doctor`.

Cf. plans/plan-design.md §2 (Architecture pipeline doctor).
"""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable

from .registry import Ref, load_ref, iter_refs
from .invariants import (
    REF_LEVEL_CHECKS,
    REF_LEVEL_CHECKS_WITH_CTX,
    REGISTRY_LEVEL_CHECKS,
    SEVERITY_BY_INVARIANT,
)


# ─────────────────────────────────────────────────────────────────────────────
# Violation dataclass — API publique
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Violation:
    """Une violation d'invariant détectée par doctor."""
    invariant: str          # "I5"
    ref_slug: str | None    # None pour registry-level (I2, I12, I13).
                            # Pour I22/I23 : `sota:<sota_stem>` (pseudo-slug,
                            # le vrai contexte est dans `fix_data`).
    severity: str           # "ERROR" | "WARN" | "INFO"
    message: str
    auto_fixable: bool
    # fix_fn signature varie :
    #   - violations ref-level : reçoit (ref: Ref)
    #   - violations sota-level (I22/I23) : reçoit (v: Violation) — accède à
    #     v.fix_data pour les paramètres
    fix_fn: Callable[..., None] | None = None
    # Contexte additionnel pour les fix_fn sota-level (wikilink_slug,
    # retracted_target, etc.).
    fix_data: dict | None = None

    def to_dict(self) -> dict:
        return {
            "invariant": self.invariant,
            "ref_slug": self.ref_slug,
            "severity": self.severity,
            "message": self.message,
            "auto_fixable": self.auto_fixable,
            "fix_data": self.fix_data,
        }


def _dict_to_violation(d: dict) -> Violation:
    return Violation(
        invariant=d["invariant"],
        ref_slug=d.get("ref_slug"),
        severity=d["severity"],
        message=d["message"],
        auto_fixable=d.get("auto_fixable", False),
        fix_fn=d.get("fix_fn"),
        fix_data=d.get("fix_data"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Core API
# ─────────────────────────────────────────────────────────────────────────────

def run_all_checks(
    refs: Iterable[Ref],
    vault_root: Path | None = None,
    correlate_rtfm: bool = False,
    check_sha: bool = False,
    rtfm_failures_override: list | None = None,
    rtfm_checks_override: dict | None = None,
) -> list[Violation]:
    """Lance tous les checks (ref-level + registry-level) sur les refs.

    Retourne une liste de Violation (vide si tout est OK).

    Args:
      vault_root: utilisé par I11 / I12 pour résoudre Publications/ et Articles/.
        Si None, utilise la valeur de config.VAULT.
      correlate_rtfm: active I16, I17, I19 (Couche 5 — appels rtfm CLI).
        Pré-charge la liste des failures RTFM une seule fois pour tout le run,
        ET interroge `rtfm check` ref-par-ref sur les états indexable-attendu
        (awaiting_rtfm_ocr, pdf_acquired, needs_reacquisition) pour capter
        les drapeaux persistants ingest/ocr_failure_reason.
      check_sha: active I18 (recompute sha256 sur tous les PDFs concernés).
        Coûteux — quelques minutes sur 909 PDFs. Opt-in.
      rtfm_failures_override: liste pré-construite de `RtfmFailure` à utiliser
        au lieu d'appeler `rtfm failed` (pour les tests / mocks).
      rtfm_checks_override: dict {slug: rtfm_check_result} pour mocker la
        passe `rtfm check` ref-par-ref (tests).
    """
    refs_list = list(refs)
    violations: list[Violation] = []

    # États où l'on attend que RTFM ait au moins essayé d'indexer le PDF.
    # On y interroge `rtfm check` pour capter les drapeaux persistants.
    _STATES_RTFM_CHECK = {"awaiting_rtfm_ocr", "pdf_acquired",
                          "needs_reacquisition"}

    # Pré-charger les failures RTFM si Couche 5 demandée (1 appel CLI au lieu de N)
    ctx: dict | None = None
    if correlate_rtfm or rtfm_failures_override is not None \
            or rtfm_checks_override is not None:
        if rtfm_failures_override is not None:
            failures = rtfm_failures_override
        elif correlate_rtfm:
            from .rtfm_failures import list_failures
            failures = list_failures()
        else:
            failures = []
        ctx = {"rtfm_failures": failures}

        # Passe ciblée `rtfm check` ref-par-ref pour les états indexable-attendu.
        # Coût : N appels CLI où N = refs en awaiting_rtfm_ocr + pdf_acquired
        # + needs_reacquisition (typiquement < 20).
        if rtfm_checks_override is not None:
            ctx["rtfm_checks"] = rtfm_checks_override
        elif correlate_rtfm:
            from .rtfm_failures import check_ref
            rtfm_checks: dict = {}
            for ref in refs_list:
                if ref.state not in _STATES_RTFM_CHECK:
                    continue
                result = check_ref(ref)
                if result is not None:
                    rtfm_checks[ref.slug] = result
            ctx["rtfm_checks"] = rtfm_checks

    # 1. Ref-level checks (sans ctx)
    for ref in refs_list:
        for inv_name, check_fn in REF_LEVEL_CHECKS:
            try:
                # I11 prend vault_root, les autres pas. On gère via try/except sur signature.
                if inv_name == "I11" and vault_root is not None:
                    dicts = check_fn(ref, vault_root)
                else:
                    dicts = check_fn(ref)
            except TypeError:
                # signature différente — fallback sans extra args
                dicts = check_fn(ref)
            for d in dicts:
                violations.append(_dict_to_violation(d))

    # 1b. Ref-level checks Couche 5 (avec ctx). Sélection selon flags.
    if correlate_rtfm or check_sha or rtfm_failures_override is not None:
        # Filtrage des invariants à exécuter selon les flags
        active_invariants = set()
        if correlate_rtfm or rtfm_failures_override is not None:
            active_invariants.update({"I16", "I17", "I19"})
        if check_sha:
            active_invariants.add("I18")
        for ref in refs_list:
            for inv_name, check_fn in REF_LEVEL_CHECKS_WITH_CTX:
                if inv_name not in active_invariants:
                    continue
                try:
                    dicts = check_fn(ref, ctx)
                except Exception as e:
                    # Un check Couche 5 qui crash ne doit pas casser le rapport
                    # (pas dans la philo doctor de remonter des bugs internes
                    # en violations — mais on log discrètement)
                    import sys
                    print(f"[doctor] WARN: {inv_name} crashed on {ref.slug}: "
                          f"{type(e).__name__}: {e}", file=sys.stderr)
                    continue
                for d in dicts:
                    violations.append(_dict_to_violation(d))

    # 2. Registry-level checks
    # Invariants qui acceptent (refs, vault_root) — I12, I20-I23 (scan SOTAs)
    _CHECKS_WITH_VAULT = {"I12", "I20", "I21", "I22", "I23"}
    for inv_name, check_fn in REGISTRY_LEVEL_CHECKS:
        try:
            if inv_name in _CHECKS_WITH_VAULT and vault_root is not None:
                dicts = check_fn(refs_list, vault_root)
            else:
                dicts = check_fn(refs_list)
        except TypeError:
            dicts = check_fn(refs_list)
        for d in dicts:
            violations.append(_dict_to_violation(d))

    return violations


def auto_fix(violations: list[Violation]) -> tuple[int, int]:
    """Applique les fix_fn pour chaque violation auto_fixable.

    Retourne (fixed_count, skipped_count). Les violations non auto_fixables
    sont skipped sans erreur.

    Note : chaque fix_fn doit charger sa ref fraîche (les violations sont des
    snapshots, le fix doit lire le YAML actuel et muter+save).
    """
    fixed = 0
    skipped = 0
    for v in violations:
        if not v.auto_fixable or v.fix_fn is None:
            skipped += 1
            continue
        # Cas violations sota-level (I22/I23) : ref_slug commence par `sota:`,
        # la fix_fn reçoit la Violation entière (avec fix_data) plutôt qu'une
        # Ref. Pas de chargement de fichier ref.
        if v.ref_slug and v.ref_slug.startswith("sota:"):
            try:
                v.fix_fn(v)
                fixed += 1
            except Exception:
                skipped += 1
            continue
        # Cas violations ref-level standard : recharger la ref depuis disque
        # (l'objet peut être stale après un fix précédent).
        if v.ref_slug is None:
            skipped += 1
            continue
        from .config import REFS
        ref_path = REFS / f"{v.ref_slug}.md"
        if not ref_path.exists():
            skipped += 1
            continue
        ref = load_ref(ref_path)
        if ref is None:
            skipped += 1
            continue
        try:
            v.fix_fn(ref)
            fixed += 1
        except Exception:
            skipped += 1
    return fixed, skipped


# ─────────────────────────────────────────────────────────────────────────────
# Severity filtering + reporting
# ─────────────────────────────────────────────────────────────────────────────

_SEVERITY_RANK = {"ERROR": 3, "WARN": 2, "INFO": 1}


def filter_by_severity(violations: list[Violation], min_severity: str) -> list[Violation]:
    """Garde uniquement les violations de sévérité >= min_severity.

    min_severity in {"info", "warn", "error"}.
    """
    min_rank = _SEVERITY_RANK.get(min_severity.upper(), 1)
    return [v for v in violations if _SEVERITY_RANK.get(v.severity, 0) >= min_rank]


def count_by_severity(violations: list[Violation]) -> dict[str, int]:
    counts = {"ERROR": 0, "WARN": 0, "INFO": 0}
    for v in violations:
        if v.severity in counts:
            counts[v.severity] += 1
    return counts


def count_auto_fixable(violations: list[Violation]) -> int:
    return sum(1 for v in violations if v.auto_fixable)


def has_errors(violations: list[Violation]) -> bool:
    return any(v.severity == "ERROR" for v in violations)


# ─────────────────────────────────────────────────────────────────────────────
# Format de rapport markdown
# ─────────────────────────────────────────────────────────────────────────────

def format_report_markdown(violations: list[Violation]) -> str:
    """Rapport markdown formaté cf. plan §2."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    lines = [f"# Pipeline doctor — {today}", ""]

    counts = count_by_severity(violations)
    n_fix = count_auto_fixable(violations)

    if not violations:
        lines.append("No violation detected — registry healthy.")
        return "\n".join(lines)

    # Grouper par sévérité (ERROR > WARN > INFO)
    for sev in ("ERROR", "WARN", "INFO"):
        vs = [v for v in violations if v.severity == sev]
        if not vs:
            continue
        lines.append(f"## {sev} ({len(vs)})")
        for v in vs:
            slug = v.ref_slug or "(registry)"
            fix_marker = " (auto-fixable)" if v.auto_fixable else ""
            lines.append(f"- {v.invariant} {slug} : {v.message}{fix_marker}")
        lines.append("")

    lines.append(
        f"Summary: {counts['ERROR']} ERROR / {counts['WARN']} WARN / "
        f"{counts['INFO']} INFO  —  {n_fix} auto-fixable with --fix"
    )
    return "\n".join(lines)


def format_report_json(violations: list[Violation]) -> str:
    """Rapport JSON machine-readable."""
    counts = count_by_severity(violations)
    payload = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "counts": counts,
        "auto_fixable": count_auto_fixable(violations),
        "violations": [v.to_dict() for v in violations],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# Point d'entrée pour intégration dans cmd_run
# ─────────────────────────────────────────────────────────────────────────────

def run_doctor_for_cli(
    refs: Iterable[Ref] | None = None,
    apply_fix: bool = False,
    min_severity: str = "info",
    as_json: bool = False,
    correlate_rtfm: bool = False,
    check_sha: bool = False,
) -> tuple[int, str]:
    """Point d'entrée commun pour CLI et intégration end-of-run.

    Args:
      correlate_rtfm: active I16, I17, I19 (appels rtfm CLI, ~1-2s).
      check_sha: active I18 (recompute sha256 sur tous les PDFs, lent).

    Retourne (returncode, output_text).
      - returncode = 1 si ERROR restant, 0 sinon
      - output_text = rapport markdown OU JSON
    """
    if refs is None:
        refs = list(iter_refs())

    violations = run_all_checks(
        refs,
        correlate_rtfm=correlate_rtfm,
        check_sha=check_sha,
    )

    if apply_fix:
        fixed, skipped = auto_fix(violations)
        # Re-run checks après fix pour mettre à jour le rapport
        if refs is not None:
            # Re-charger les refs (les fix ont touché disque)
            refs_reloaded = list(iter_refs())
            violations = run_all_checks(
                refs_reloaded,
                correlate_rtfm=correlate_rtfm,
                check_sha=check_sha,
            )
        prefix_note = f"\n[auto-fix] {fixed} violation(s) repaired, {skipped} skipped\n"
    else:
        prefix_note = ""

    filtered = filter_by_severity(violations, min_severity)

    if as_json:
        out = format_report_json(filtered)
    else:
        out = prefix_note + format_report_markdown(filtered)

    rc = 1 if has_errors(filtered) else 0
    return rc, out
