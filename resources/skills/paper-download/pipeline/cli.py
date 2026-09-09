"""CLI argparse — `python -m pipeline <subcommand> [options]`."""
from __future__ import annotations
import argparse
import json
import contextlib
import sys
from collections import Counter

from .config import REFS, STATE_ORDER, TERMINAL_STATES, WAITING_STATES, BLOCKED_PREFIX
from .registry import iter_refs
from .dispatcher import plan_for, IllegalTransition
from .transitions import REGISTRY as TRANSITIONS, NotImplementedYet
from .journal import append_event, append_blocked
from .linter_wrapper import run_lint
from .doctor import run_doctor_for_cli
from .lock import WorkerLock, LockBusyError
from . import events as events_mod


def cmd_status(args: argparse.Namespace) -> int:
    """Affiche les comptes par état + un échantillon des refs actives."""
    counter: Counter[str] = Counter()
    blocked_kinds: Counter[str] = Counter()
    total = 0
    for ref in iter_refs():
        total += 1
        s = ref.state
        counter[s] += 1
        if s.startswith(BLOCKED_PREFIX):
            blocked_kinds[s] += 1

    print(f"# Registry status — {total} refs")
    print()
    print(f"{'State':<40} {'Count':>6}  {'Category':<20}")
    print("-" * 70)

    def cat(state: str) -> str:
        if state in TERMINAL_STATES:
            return "terminal"
        if state in WAITING_STATES:
            return "waiting"
        if state.startswith(BLOCKED_PREFIX):
            return "blocked_human"
        return "active"

    for state, n in sorted(counter.items(),
                           key=lambda kv: (STATE_ORDER.get(kv[0], 50), -kv[1])):
        print(f"{state:<40} {n:>6}  {cat(state):<20}")

    print()
    active = sum(counter[s] for s in counter if cat(s) == "active")
    waiting = sum(counter[s] for s in counter if cat(s) == "waiting")
    blocked = sum(counter[s] for s in counter if cat(s) == "blocked_human")
    terminal = sum(counter[s] for s in counter if cat(s) == "terminal")
    print(f"Summary: active={active}  waiting={waiting}  blocked_human={blocked}  terminal={terminal}")
    return 0


def cmd_lint(args: argparse.Namespace) -> int:
    """Lance le linter (lint_registry.py existant) et affiche le rapport."""
    rc, out = run_lint(verbose=True)
    if rc != 0:
        print(f"\n[lint] returncode={rc} — invariants violated", file=sys.stderr)
    return rc


def _preflight_dependencies() -> list[str]:
    """Vérifie les dépendances de la cascade avant de traiter la moindre ref.

    Sans ce garde, un interpréteur sans `bs4` (venv oublié) fait planter
    chaque ref l'une après l'autre : le récap affiche `blocked=N` et le
    doctor ne dit rien du motif réel. Cf. issue #1.
    """
    missing = []
    for module, package in (("bs4", "beautifulsoup4"), ("requests", "requests"),
                            ("yaml", "PyYAML")):
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    return missing


def _clear_exhaustion_locks(verbose: bool = False) -> int:
    """Lève les verrous `cascade_exhausted_needs_manual` avant une passe.

    Sert les reprises automatiques (créneau libéré, nouvelle édition en
    ligne, source ajoutée depuis) sans imposer un `arbitrate --decision
    unblock` ref par ref. Ne touche à aucun autre `blocked_by` : les
    verrous posés par un humain restent intacts.
    """
    from .registry import iter_refs, save_ref
    n = 0
    for ref in iter_refs():
        if ref.frontmatter.get("blocked_by") == "cascade_exhausted_needs_manual":
            ref.frontmatter.pop("blocked_by", None)
            ref.frontmatter.pop("retry_after", None)
            ref.frontmatter.pop("transient_retries", None)
            save_ref(ref)
            n += 1
            if verbose:
                print(f"[unblock] {ref.slug}: cascade lock lifted for a new attempt")
    if n:
        print(f"[retry-exhausted] {n} ref(s) unlocked for this pass")
    return n


def _run_one_pass(args: argparse.Namespace) -> dict:
    """Une passe de transitions sur les refs actives. Retourne les compteurs.

    Mêmes filtres et logique que `cmd_run`, mais isolé pour permettre la
    réexécution en boucle (mode `--loop`).
    """
    missing = _preflight_dependencies()
    if missing:
        print(f"[FATAL] missing dependencies: {', '.join(missing)} — "
              f"`pip install {' '.join(missing)}` (or run from the plugin venv). "
              f"Without them every ref would crash and be counted `blocked`.",
              file=sys.stderr)
        return {"planned": 0, "done": 0, "pending": 0, "blocked": 0,
                "skipped_terminal": 0, "fatal": True}
    if getattr(args, "retry_exhausted", False):
        # Une seule levée, à la première passe : en mode --loop, relever les
        # verrous à chaque itération relancerait la cascade complète sur des
        # refs définitivement épuisées, jusqu'à `--max-iterations` fois.
        _clear_exhaustion_locks(verbose=getattr(args, "verbose", False))
        args.retry_exhausted = False

    n_planned = 0
    n_done = 0
    n_blocked = 0
    n_skip = 0
    n_pending = 0

    # Une passe entière rejoue les échecs déjà connus de toutes les fiches en
    # attente : acquérir cinq nouvelles références coûtait un quart d'heure.
    # `--ref` accepte donc une liste, pas seulement une fiche.
    wanted_slugs = {s.strip() for s in (getattr(args, "ref", "") or "").split(",")
                    if s.strip()}

    for ref in sorted(iter_refs(), key=lambda r: STATE_ORDER.get(r.state, 50)):
        if args.state and ref.state != args.state:
            continue
        if wanted_slugs and ref.slug not in wanted_slugs:
            continue
        if args.cited_in:
            consumers = {c.get("name") for c in ref.cited_in}
            if not set(args.cited_in) & consumers:
                continue
        if args.limit and n_planned >= args.limit:
            break

        try:
            plan = plan_for(ref)
        except IllegalTransition as e:
            print(f"[ILLEGAL] {ref.slug}: {e}", file=sys.stderr)
            append_blocked(ref.slug, ref.state, f"illegal_state:{e}")
            n_blocked += 1
            continue

        if plan is None:
            n_skip += 1
            continue

        n_planned += 1
        if args.dry_run:
            print(f"[plan] {ref.slug:<60} {ref.state:<25} → {plan.fn_name}  # {plan.reason}")
            continue

        fn = TRANSITIONS.get(plan.fn_name)
        if fn is None:
            print(f"[BUG] transition {plan.fn_name!r} absente du registre", file=sys.stderr)
            continue

        from_state = ref.state
        try:
            res = fn(ref)
        except NotImplementedYet as e:
            n_pending += 1
            if args.verbose:
                print(f"[pending] {ref.slug:<60} {from_state:<25} → {plan.fn_name}  ({e})")
            continue
        except Exception as e:
            n_blocked += 1
            append_blocked(ref.slug, from_state, f"worker_crash:{type(e).__name__}:{e}")
            print(f"[CRASH] {ref.slug}: {type(e).__name__}: {e}", file=sys.stderr)
            continue

        if res.succeeded:
            append_event(ref.slug, res.from_state, res.to_state, res.via, res.meta)
            n_done += 1
            print(f"[done] {ref.slug:<60} {res.from_state:<25} → {res.to_state}")
        else:
            append_blocked(ref.slug, from_state, res.blocked_reason or "unknown")
            n_blocked += 1

    return {"planned": n_planned, "done": n_done, "pending": n_pending,
            "blocked": n_blocked, "skipped_terminal": n_skip}


def _set_memory_limit(max_gb: float = 1.5) -> None:
    """Borne la RAM virtuelle du process pour éviter de freezer la machine.

    Si un téléchargement géant ou une fuite mémoire pousse au-delà,
    Python lèvera MemoryError (capturé en CRASH) au lieu d'épuiser
    la mémoire système.
    """
    try:
        import resource
        max_bytes = int(max_gb * 1024 * 1024 * 1024)
        # Limite DOUCE seulement : la limite dure d'origine est préservée.
        # Sinon la borne devient irréversible pour le process, et un
        # sous-processus légitimement gourmand en espace d'adressage — un
        # navigateur en réserve des dizaines de Go — ne peut plus démarrer
        # (les rlimits sont héritées par les fils).
        _, hard = resource.getrlimit(resource.RLIMIT_AS)
        if hard != resource.RLIM_INFINITY:
            max_bytes = min(max_bytes, hard)
        resource.setrlimit(resource.RLIMIT_AS, (max_bytes, hard))
    except (ImportError, ValueError, OSError):
        pass


def cmd_run(args: argparse.Namespace) -> int:
    """Boucle principale. Une passe par défaut, ou jusqu'à épuisement avec --loop.

    En mode --dry-run, n'effectue aucune mutation.
    En mode --loop, itère tant que au moins une transition est faite (done > 0)
    ou jusqu'à `--max-iterations` (default 10).
    """
    _set_memory_limit(1.5)
    loop = getattr(args, "loop", False)
    max_iter = getattr(args, "max_iterations", 10)

    if not loop:
        stats = _run_one_pass(args)
        if stats.get("fatal"):
            return 1
        print()
        print(f"Session summary: planned={stats['planned']}  done={stats['done']}  "
              f"pending={stats['pending']}  blocked={stats['blocked']}  "
              f"skipped_terminal={stats['skipped_terminal']}")
        # Indice : une fiche enchaîne plusieurs transitions (uid_resolved →
        # pdf_acquired → page1_validated). Une passe = une transition par
        # fiche. Pour aller jusqu'à un état stable en un seul appel, suggérer
        # explicitement `--loop`.
        if stats["done"] > 0:
            print(
                "  → re-run with `pipeline run --loop` to auto-chain the "
                "following transitions until exhaustion."
            )
    else:
        total = {"planned": 0, "done": 0, "pending": 0, "blocked": 0,
                 "skipped_terminal": 0}
        iteration = 0
        while iteration < max_iter:
            iteration += 1
            print(f"\n# Loop iteration {iteration}/{max_iter}")
            stats = _run_one_pass(args)
            if stats.get("fatal"):
                return 1
            for k in total:
                total[k] += stats[k]
            print(f"  → iteration {iteration} : done={stats['done']}  "
                  f"blocked={stats['blocked']}  pending={stats['pending']}")
            if stats["done"] == 0:
                print(f"\n# Loop finished: 0 transitions at iteration {iteration} "
                      f"→ exhaustion reached.")
                break
        else:
            print(f"\n# Loop stopped: max_iterations={max_iter} reached with "
                  f"transitions still in progress. Re-run `pipeline run --loop` "
                  f"to continue.")
        print()
        print(f"CUMULATIVE summary ({iteration} iteration(s)): "
              f"planned={total['planned']}  done={total['done']}  "
              f"pending={total['pending']}  blocked={total['blocked']}  "
              f"skipped_terminal={total['skipped_terminal']}")

    rc_lint = 0
    rc_doctor = 0

    if not args.no_lint and not args.dry_run:
        print()
        print("# Lint final")
        rc_lint, _out = run_lint(verbose=True)
        if rc_lint != 0:
            print(f"[lint] returncode={rc_lint} — invariants R1-R10 violated",
                  file=sys.stderr)

    # Doctor en fin de session (Couche 1) : invariants I1-I15. Jamais --fix auto.
    # Miroir de --no-lint : --no-doctor pour skip.
    if not getattr(args, "no_doctor", False) and not args.dry_run:
        print()
        print("# Doctor final (invariants I1-I15)")
        rc_doctor, out_doctor = run_doctor_for_cli(
            refs=None, apply_fix=False, min_severity="info", as_json=False,
        )
        print(out_doctor)
        if rc_doctor != 0:
            print(f"[doctor] returncode={rc_doctor} — invariants I1-I15 violated",
                  file=sys.stderr)

    return max(rc_lint, rc_doctor)


def cmd_arbitrate(args: argparse.Namespace) -> int:
    """Décision humaine pour refs problématiques (cascade épuisée, etc.).

    3 décisions :
      - retract  : ref est un artefact, ne devrait pas exister.
                   state → `retracted` (terminal).
      - blocked  : ref existe mais inaccessible (paywall, hors-ligne).
                   state → `blocked_human:cascade_exhausted`.
      - investigate : besoin de corriger frontmatter (auteur, titre, doi)
                   puis relancer cascade. Retire `blocked_by` et appose
                   un flag `human_investigate`.

    Refuse les décisions sur refs déjà terminales (retracted ou validées).
    """
    from .registry import load_ref, save_ref, append_state_history
    from pathlib import Path

    slug = args.slug
    path = REFS / f"{slug}.md"
    if not path.exists():
        print(f"[ERR] ref introuvable : {slug}", file=sys.stderr)
        return 2
    ref = load_ref(path)
    if ref is None:
        print(f"[ERR] ref illisible : {slug}", file=sys.stderr)
        return 2

    if ref.state in ("retracted", "sota_cited_confirmed"):
        print(f"[NOOP] {slug} already terminal ({ref.state})", file=sys.stderr)
        return 1

    decision = args.decision
    reason = (args.reason or "").strip() or "manual_arbitration"
    from_state = ref.state

    if decision == "retract":
        append_state_history(ref, "retracted", by="human_arbitration",
                             meta={"reason": reason})
        ref.frontmatter["retracted_reason"] = reason
        from datetime import datetime, timezone
        ref.frontmatter["retracted_at"] = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ")
    elif decision == "blocked":
        new_state = "blocked_human:cascade_exhausted"
        append_state_history(ref, new_state, by="human_arbitration",
                             meta={"reason": reason})
        ref.frontmatter["blocked_reason"] = reason
    elif decision == "investigate":
        flags = ref.frontmatter.setdefault("doctor_flags", [])
        flags.append(f"human_investigate:{reason}")
        ref.frontmatter.pop("blocked_by", None)
        # Pas de mutation de state. La transition normale reprendra.
    elif decision == "unblock":
        # Repasse la ref en uid_resolved pour relancer la cascade.
        # Utile quand une nouvelle source est dispo OU si l'utilisateur
        # veut retenter après correction frontmatter / réseau / proxy.
        if from_state not in ("candidate", "uid_resolved",
                              "needs_reacquisition"):
            target_state = "uid_resolved"
        else:
            target_state = from_state
        append_state_history(ref, target_state, by="human_arbitration",
                             meta={"reason": reason, "via": "unblock"})
        ref.frontmatter.pop("blocked_by", None)
        ref.frontmatter.pop("blocked_reason", None)
    elif decision == "reject-pdf":
        # L'utilisateur a identifié que le PDF acquis n'est pas la bonne
        # source (TOC au lieu du paper, mauvaise version, etc.). On :
        # 1. Ajoute le sha actuel à rejected_sha256 (anti-rebouclage)
        # 2. Bouge le PDF en quarantaine
        # 3. Repasse en needs_reacquisition pour relancer la cascade
        current_sha = ref.frontmatter.get("pdf_sha256")
        current_pdf = ref.frontmatter.get("pdf_path")
        if current_sha:
            rejected = ref.frontmatter.setdefault("rejected_sha256", [])
            if current_sha not in rejected:
                rejected.append(current_sha)
        # Quarantine le PDF (déplace hors du dossier Sources)
        quarantined = False
        if current_pdf:
            from .config import SOURCES
            from .cascade import QUARANTINE
            import shutil
            src = SOURCES / current_pdf
            if src.exists():
                QUARANTINE.mkdir(parents=True, exist_ok=True)
                qpath = QUARANTINE / f"{slug}_human_rejected_{src.name}"
                try:
                    shutil.move(str(src), str(qpath))
                    quarantined = True
                except OSError as e:
                    print(f"[WARN] quarantine failed: {e}", file=sys.stderr)
        # Reset des champs PDF + state
        ref.frontmatter.pop("pdf_path", None)
        ref.frontmatter.pop("pdf_sha256", None)
        flags = ref.frontmatter.setdefault("doctor_flags", [])
        flags.append(f"human_rejected_pdf:{reason}")
        append_state_history(ref, "needs_reacquisition",
                             by="human_arbitration",
                             meta={"reason": reason,
                                   "via": "reject_pdf",
                                   "quarantined": quarantined,
                                   "rejected_sha_added": bool(current_sha)})
    else:
        print(f"[ERR] unknown decision: {decision}", file=sys.stderr)
        return 2

    save_ref(ref)
    append_event(slug, from_state, ref.frontmatter["state"],
                 f"arbitrate:{decision}", {"reason": reason})
    print(f"[ok] {slug}  {from_state} → {ref.frontmatter['state']}  "
          f"({decision}: {reason[:50]})")

    # Propagation cohérence SOTA ↔ registre (Phase 2 du plan refonte INGEST).
    # Si on retract, les wikilinks dans les SOTAs deviennent obsolètes.
    if decision == "retract":
        try:
            from .sota_sync import update_wikilinks_in_sotas
            sync = update_wikilinks_in_sotas(
                old_slug=slug, new_slug=None,
                reason=f"retract:{reason[:60]}",
            )
            if sync.total_substitutions > 0:
                print(f"       sync: {sync.total_substitutions} wikilink(s) "
                      f"removed in {len(sync.sotas_touched)} SOTA(s)")
            if sync.errors:
                for e in sync.errors[:3]:
                    print(f"       sync error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"[WARN] sota_sync failed: {e}", file=sys.stderr)
    return 0


def cmd_registry_cleanup(args: argparse.Namespace) -> int:
    """Nettoyage historique du registre — version élargie de resolve-textbooks.

    Différence avec `resolve-textbooks` (session-locale, traite uniquement les
    refs textbook ingérées sans year/title) :
    - Cible aussi les **duplicates avec suffixe numérique** moche
      (`foo_2020_bar_2`, `foo_2020_bar_2_3`, etc.) qui sont des artefacts
      de runs INGEST passés ou de désambiguation `_make_slug`.
    - Inclut tous les `_0000_*` et `_untitled` (comme resolve-textbooks).

    Délégation au sub-agent `textbook-resolver` pour les décisions IA.
    Quand le sub-agent décide `merge_into`, le hook `sota_sync` (P2)
    propage automatiquement la fusion vers tous les SOTAs.

    Usage :
      pipeline registry-cleanup --list                  # JSON candidates
      pipeline registry-cleanup --apply-from <path>     # applique décisions
    """
    import re as _re
    from collections import defaultdict
    from .registry import iter_refs

    # Pattern d'un suffixe numérique moche : `_2`, `_2_3`, `_2_3_4`, etc.
    UGLY_SUFFIX_RE = _re.compile(r"_\d+(_\d+)*$")

    if getattr(args, "list_candidates", False):
        candidates = []
        by_lastname = defaultdict(list)
        for ref in iter_refs():
            fm = ref.frontmatter
            year = str(fm.get("year") or "")
            title = fm.get("title") or ""
            slug = ref.slug
            # Critères élargis vs resolve-textbooks :
            is_candidate = (
                slug.endswith("_untitled")
                or year in ("", "0000", "nd", "None")
                or not title
                or bool(UGLY_SUFFIX_RE.search(slug))
            )
            if is_candidate and fm.get("state") in (
                "candidate", "page1_validated", "uid_resolved"
            ):
                candidates.append({
                    "slug": slug,
                    "author": fm.get("author") or "",
                    "year": year,
                    "title": title,
                    "state": fm.get("state"),
                    "ingest_source": fm.get("ingest_source") or "",
                    "pdf_path": fm.get("pdf_path") or "",
                    "ugly_suffix": bool(UGLY_SUFFIX_RE.search(slug)),
                })
            lname = slug.split("_")[0]
            by_lastname[lname].append({
                "slug": slug,
                "year": year,
                "title": title[:80],
                "state": fm.get("state"),
                "has_pdf": bool(fm.get("pdf_path")),
            })
        for cand in candidates:
            lname = cand["slug"].split("_")[0]
            cand["siblings"] = [
                s for s in by_lastname.get(lname, [])
                if s["slug"] != cand["slug"]
            ]
        print(json.dumps(candidates, ensure_ascii=False, indent=2))
        return 0

    # --apply-from : on délègue à cmd_resolve_textbooks (logique apply identique :
    # merge_into / complete / blocked, avec hook sota_sync auto pour les merge).
    apply_from = getattr(args, "apply_from", None)
    if not apply_from:
        print("[ERR] Mode inconnu. Utilise --list ou --apply-from <path.json>",
              file=sys.stderr)
        return 2
    # Réutilise la logique apply de cmd_resolve_textbooks (même format JSON).
    args_proxy = argparse.Namespace(
        list_candidates=False, apply_from=apply_from,
    )
    return cmd_resolve_textbooks(args_proxy)


def cmd_resolve_textbooks(args: argparse.Namespace) -> int:
    """Pour les refs textbooks ingérées sans year/title (slugs
    `_0000_untitled` ou `_untitled`), liste les candidates ou applique
    des décisions JSON (fusion, complétion, blocked).

    Modes :
      - `--list` : JSON sur stdout des refs à résoudre, avec siblings
        (refs même lastname) pour aider à la fusion
      - `--apply-from <decisions.json>` : applique les décisions

    Format decisions.json :
      [
        {"slug": "hopcroft_0000_untitled", "action": "merge_into",
         "target_slug": "hopcroft_2001_introduction"},
        {"slug": "sipser_0000_untitled", "action": "complete",
         "year": "2012", "title": "Introduction to the Theory of Computation"},
        {"slug": "wolper_0000_untitled", "action": "blocked",
         "reason": "textbook_unidentified"}
      ]
    """
    from .registry import load_ref, save_ref, append_state_history
    from pathlib import Path
    from collections import defaultdict
    from datetime import datetime, timezone

    if getattr(args, "list_candidates", False):
        candidates = []
        by_lastname = defaultdict(list)
        for ref in iter_refs():
            fm = ref.frontmatter
            year = str(fm.get("year") or "")
            title = fm.get("title") or ""
            slug = ref.slug
            is_candidate = (
                slug.endswith("_untitled")
                or year in ("", "0000", "nd", "None")
                or not title
            )
            if is_candidate and fm.get("state") in (
                "candidate", "page1_validated", "uid_resolved"
            ):
                candidates.append({
                    "slug": slug,
                    "author": fm.get("author") or "",
                    "year": year,
                    "title": title,
                    "state": fm.get("state"),
                    "ingest_source": fm.get("ingest_source") or "",
                    "pdf_path": fm.get("pdf_path") or "",
                })
            lname = slug.split("_")[0]
            by_lastname[lname].append({
                "slug": slug,
                "year": year,
                "title": title[:80],
                "state": fm.get("state"),
                "has_pdf": bool(fm.get("pdf_path")),
            })
        for cand in candidates:
            lname = cand["slug"].split("_")[0]
            cand["siblings"] = [
                s for s in by_lastname.get(lname, [])
                if s["slug"] != cand["slug"]
            ]
        print(json.dumps(candidates, ensure_ascii=False, indent=2))
        return 0

    apply_from = getattr(args, "apply_from", None)
    if not apply_from:
        print("[ERR] Mode inconnu. Utilise --list ou --apply-from <path.json>",
              file=sys.stderr)
        return 2

    json_path = Path(apply_from)
    if not json_path.exists():
        print(f"[ERR] decisions JSON introuvable : {json_path}",
              file=sys.stderr)
        return 2
    decisions = json.loads(json_path.read_text(encoding="utf-8"))
    if not isinstance(decisions, list):
        print("[ERR] decisions.json must be a list", file=sys.stderr)
        return 2

    n_merged = n_completed = n_blocked = n_err = 0
    for d in decisions:
        slug = d.get("slug")
        action = d.get("action")
        if not slug or not action:
            n_err += 1
            continue
        ref_path = REFS / f"{slug}.md"
        if not ref_path.exists():
            print(f"[skip] {slug} introuvable", file=sys.stderr)
            n_err += 1
            continue
        ref = load_ref(ref_path)
        if action == "merge_into":
            target = d.get("target_slug")
            if not target or not (REFS / f"{target}.md").exists():
                print(f"[ERR] target {target} not found for {slug}",
                      file=sys.stderr)
                n_err += 1
                continue
            target_ref = load_ref(REFS / f"{target}.md")
            # Transfert pdf_path éventuel
            if (ref.frontmatter.get("pdf_path")
                    and not target_ref.frontmatter.get("pdf_path")):
                target_ref.frontmatter["pdf_path"] = ref.frontmatter["pdf_path"]
                if ref.frontmatter.get("pdf_sha256"):
                    target_ref.frontmatter["pdf_sha256"] = ref.frontmatter["pdf_sha256"]
                save_ref(target_ref)
            # Marque la ref source comme fusionnée (retracted)
            append_state_history(ref, "retracted", by="resolve_textbooks",
                                 meta={"merged_into": target,
                                       "reason": "duplicate_textbook"})
            ref.frontmatter["retracted_reason"] = f"merged_into:{target}"
            ref.frontmatter["retracted_at"] = datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ")
            save_ref(ref)
            append_event(slug, "candidate", "retracted",
                         "resolve_textbooks:merge", {"merged_into": target})
            n_merged += 1
            print(f"[merge] {slug} → {target}")
            # Propagation cohérence : remplace les wikilinks `[[slug]]` par
            # `[[target]]` dans les SOTAs (Phase 2 du plan refonte INGEST).
            try:
                from .sota_sync import update_wikilinks_in_sotas
                sync = update_wikilinks_in_sotas(
                    old_slug=slug, new_slug=target,
                    reason=f"merged_into:{target}",
                )
                if sync.total_substitutions > 0:
                    print(f"        sync: {sync.total_substitutions} "
                          f"wikilink(s) → {target} in "
                          f"{len(sync.sotas_touched)} SOTA(s)")
                if sync.errors:
                    for e in sync.errors[:3]:
                        print(f"        sync error: {e}", file=sys.stderr)
            except Exception as e:
                print(f"[WARN] sota_sync failed: {e}", file=sys.stderr)
        elif action == "complete":
            year = d.get("year")
            title = d.get("title")
            venue = d.get("venue")
            if year:
                ref.frontmatter["year"] = str(year)
            if title:
                ref.frontmatter["title"] = title
            if venue:
                ref.frontmatter["venue"] = venue
            from .ingest import _make_slug
            new_slug = _make_slug(
                ref.frontmatter.get("author") or "",
                str(ref.frontmatter.get("year") or ""),
                ref.frontmatter.get("title") or "",
            )
            i = 2
            while (REFS / f"{new_slug}.md").exists() and new_slug != slug:
                new_slug = f"{new_slug}_{i}"
                i += 1
            ref.frontmatter["slug"] = new_slug
            save_ref(ref)
            if new_slug != slug:
                (REFS / f"{slug}.md").rename(REFS / f"{new_slug}.md")
            n_completed += 1
            t_short = (title or "")[:40]
            print(f"[complete] {slug} → {new_slug} (year={year}, title={t_short})")
        elif action == "blocked":
            reason = d.get("reason") or "textbook_unidentified"
            append_state_history(ref, "blocked_human:textbook_unidentified",
                                 by="resolve_textbooks",
                                 meta={"reason": reason})
            ref.frontmatter["blocked_reason"] = reason
            save_ref(ref)
            n_blocked += 1
            print(f"[blocked] {slug}  reason={reason}")
        else:
            print(f"[ERR] unknown action: {action!r} for {slug}",
                  file=sys.stderr)
            n_err += 1

    print(f"\nResolved: merged={n_merged}  completed={n_completed}  "
          f"blocked={n_blocked}  errors={n_err}")
    return 1 if n_err else 0


def cmd_search(args: argparse.Namespace) -> int:
    """Recherche dans le registre validé (`page1_validated` ou
    `sota_cited_confirmed` selon `--include-pending`).

    Filtre par match insensible à la casse sur auteur + titre + year.
    Sortie : liste compacte avec slug, auteur, année, titre, état.
    """
    query = (args.query or "").strip().lower()
    if not query:
        print("[ERR] Query vide. Usage : pipeline search <terme>",
              file=sys.stderr)
        return 2

    include_pending = bool(getattr(args, "include_pending", False))
    valid_states = {"sota_cited_confirmed"}
    if include_pending:
        valid_states.add("page1_validated")

    matches = []
    for ref in iter_refs():
        if ref.state not in valid_states:
            continue
        fm = ref.frontmatter
        haystack = " ".join(str(fm.get(k) or "") for k in
                            ("author", "title", "year"))
        haystack += " " + ref.slug
        if query in haystack.lower():
            matches.append(ref)

    limit = getattr(args, "limit", 0) or 50
    matches = matches[:limit]
    if not matches:
        print(f"No ref matches {query!r} among the validated refs.")
        return 0
    print(f"{len(matches)} validated refs match {query!r}:\n")
    for ref in matches:
        fm = ref.frontmatter
        author = (fm.get("author") or "?")[:25]
        year = fm.get("year") or "?"
        title = (fm.get("title") or "")[:60]
        print(f"  [{ref.state:<25}] {author:<25} ({year}) — {title}")
        print(f"     {ref.slug}")
    return 0


def cmd_ingest(args: argparse.Namespace) -> int:
    """Ingest les citations d'un SOTA (ou de tous les SOTAs) dans le registre.

    Convertit les citations en texte libre en wikilinks `[[slug]]` après
    avoir créé les refs correspondantes dans le registre.

    Modes :
      - `pipeline ingest --init-git` : initialise git dans le vault
      - `pipeline ingest <sota> --extract-only` : liste les sections
        bibliographiques candidates (pour orchestration par Claude)
      - `pipeline ingest <sota> --citations-json <path>` : applique
        l'ingestion avec un JSON déjà parsé par le sub-agent
      - `pipeline ingest --all --dry-run` : scan tous les SOTAs, montre
        ce qui serait ingéré, ne mute rien
    """
    from . import ingest as ingest_mod
    from adapters import get_adapter
    from .config import VAULT
    from pathlib import Path

    # Mode 1 : init git
    if getattr(args, "init_git", False):
        return 0 if ingest_mod.init_git_vault(VAULT) else 1

    # Mode 2 : extract-only (liste les sections)
    if getattr(args, "extract_only", False):
        sota = Path(args.sota)
        if not sota.exists():
            print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
            return 2
        adapter = get_adapter()
        sections = adapter.extract_bibliography_sections(sota)
        out = [
            {
                "header": s.header,
                "is_excluded": s.is_excluded,
                "start_offset": s.start_offset,
                "end_offset": s.end_offset,
                "raw_text": s.raw_text,
            }
            for s in sections
        ]
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    # Mode 3 : ingest avec JSON de citations déjà parsées
    if args.citations_json:
        sota = Path(args.sota)
        json_path = Path(args.citations_json)
        if not sota.exists():
            print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
            return 2
        if not json_path.exists():
            print(f"[ERR] JSON citations introuvable : {json_path}",
                  file=sys.stderr)
            return 2
        apply = bool(getattr(args, "apply", False))
        if apply:
            if not ingest_mod._ensure_git_backup(
                VAULT, f"paper-trail ingest before modifying {sota.name}"
            ):
                print("[ERR] git backup impossible. Use --init-git first, "
                      "or drop --apply for a dry-run.", file=sys.stderr)
                return 2
        result = ingest_mod.ingest_citations_from_json(
            sota, json_path, apply=apply
        )
        # Mode JSON structuré : pour scripting et fixtures (H6)
        if getattr(args, "json_output", False):
            print(json.dumps(result.to_metrics_dict(), ensure_ascii=False,
                             indent=2))
            return 1 if result.errors else 0
        # Mode texte humain
        m = result.to_metrics_dict()
        print(f"\n=== Ingest result : {sota.name} ===")
        print(f"  apply={apply}  duration={m['duration_seconds']}s")
        print(f"  citations    : {m['citations_total']} "
              f"(doi_resolved {m['doi_resolved']}, skipped_low "
              f"{m['skipped_low_confidence']})")
        print(f"  new_refs     : {m['new_refs_created']}")
        for s in result.new_refs[:20]:
            print(f"    + {s}")
        print(f"  reused_refs  : {m['reused_refs']} "
              f"(by_doi {m['matched_by_doi']}, by_fuzzy {m['matched_by_fuzzy']})")
        for s in result.reused_refs[:20]:
            print(f"    = {s}")
        print(f"  substitutions: {m['wikilinks_substituted']}")
        if m["orphan_pdfs_found"]:
            print(f"  orphan PDFs  : {m['orphan_pdfs_found']} "
                  f"({m['page1_validated']} validated page 1)")
        if result.errors:
            print(f"  errors : {len(result.errors)}")
            for e in result.errors[:5]:
                print(f"    ! {e}")
        return 1 if result.errors else 0

    # Mode 4 : --all (batch sur tout le vault, dry-run/apply)
    if getattr(args, "all_sotas", False):
        adapter = get_adapter()
        sotas = list(adapter.find_sotas())
        print(f"Scanning {len(sotas)} SOTAs for bibliographic sections...")
        total_sections = 0
        sotas_with_sections = 0
        for sota in sotas:
            sections = adapter.extract_bibliography_sections(sota)
            non_excl = [s for s in sections if not s.is_excluded]
            if non_excl:
                sotas_with_sections += 1
                total_sections += len(non_excl)
                print(f"  {sota.stem:<60} {len(non_excl)} section(s)")
        print(f"\n→ {sotas_with_sections}/{len(sotas)} SOTAs with candidate "
              f"sections ({total_sections} sections in total)")
        print("\nNext step: orchestrate the citation-parser sub-agent via "
              "/paper-trail:ingest-all (slash command), which invokes the "
              "sub-agent to parse each section, then calls this CLI with the "
              "resulting JSON.")
        return 0

    print("[ERR] Unknown mode. See `pipeline ingest --help`.", file=sys.stderr)
    return 2


def cmd_acquire(args: argparse.Namespace) -> int:
    """Troisième passe : lance la cascade ciblée pour les refs d'un SOTA.

    Pour chaque slug cité par le SOTA (wikilinks existants) + slugs à
    créer (depuis IdentifyReport), pousse la ref dans la FSM jusqu'à
    terminal (page1_validated / sota_cited_confirmed / retracted) ou
    blocage.

    Différence avec `pipeline run` : ciblé au scope d'UN SOTA.

    Usage :
      pipeline acquire <sota> [--citations-json <path>] [--apply] [--json]
    """
    from . import identify as id_mod
    from . import acquire as acq_mod
    from .ingest import ParsedCitation
    from pathlib import Path as _Path

    sota = _Path(args.sota)
    if not sota.exists():
        print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
        return 2

    # IdentifyReport optionnel (si --citations-json) sinon scan
    # uniquement les wikilinks existants.
    report = None
    citations_json = getattr(args, "citations_json", None)
    if citations_json:
        cj = _Path(citations_json)
        if not cj.exists():
            print(f"[ERR] JSON citations introuvable : {cj}", file=sys.stderr)
            return 2
        data = json.loads(cj.read_text(encoding="utf-8"))
        citations = [ParsedCitation(**c) for c in data]
        report = id_mod.identify_sota(sota, citations)

    target_slugs = acq_mod.slugs_cited_by_sota(sota, identify_report=report)
    apply = bool(getattr(args, "apply", False))
    batch = acq_mod.run_acquire_for_sota(sota, target_slugs, apply=apply)

    if getattr(args, "json_output", False):
        print(json.dumps(batch.to_dict(), ensure_ascii=False, indent=2))
        return 1 if batch.errors else 0

    print(f"\n=== Acquire : {sota.name} ===")
    print(f"  Mode: {'APPLY' if apply else 'DRY-RUN'}")
    print(f"  Target slugs   : {len(target_slugs)}")
    print(f"  Succeeded      : {len(batch.succeeded)} (page1_validated)")
    print(f"  Pending        : {len(batch.pending)} (cascade to finish)")
    print(f"  Blocked        : {len(batch.blocked)}")
    print(f"  Skipped (term) : {len(batch.skipped_terminal)}")
    if batch.errors:
        print(f"  Errors         : {len(batch.errors)}")
        for e in batch.errors[:5]:
            print(f"    {e}")
    return 1 if batch.errors else 0


def cmd_identify(args: argparse.Namespace) -> int:
    """Première passe (read-only) : produit un rapport d'identification.

    Pour chaque mention parsée, résout DOI + reconcile registry + retourne
    le verdict (reuse / create / retracted / low conf). Ne mute rien.

    Usage :
      pipeline identify <sota> --citations-json <path>
      pipeline identify <sota> --citations-json <path> --json
    """
    from . import identify as id_mod
    from .ingest import ingest_citations_from_json, ParsedCitation
    from pathlib import Path as _Path

    sota = _Path(args.sota)
    if not sota.exists():
        print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
        return 2

    citations_json_path = _Path(args.citations_json)
    if not citations_json_path.exists():
        print(f"[ERR] JSON citations introuvable : {citations_json_path}",
              file=sys.stderr)
        return 2

    raw_json = citations_json_path.read_text(encoding="utf-8")
    data = json.loads(raw_json)
    citations = [ParsedCitation(**c) for c in data]
    report = id_mod.identify_sota(sota, citations)

    if getattr(args, "json_output", False):
        print(json.dumps(report.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(id_mod.report_to_text(report))
    return 1 if report.errors else 0


def cmd_linkify(args: argparse.Namespace) -> int:
    """Quatrième passe : insère les wikilinks + section Statut.

    Pour chaque mention :
      - ref validée + PDF → wikilink direct vers le PDF
      - sinon → wikilink vers ancre dans section ## Statut des sources

    Usage :
      pipeline linkify <sota> --citations-json <path>           # dry-run
      pipeline linkify <sota> --citations-json <path> --apply
    """
    from . import identify as id_mod
    from . import linkify as link_mod
    from .ingest import ParsedCitation, _ensure_git_backup
    from .config import VAULT
    from pathlib import Path as _Path

    sota = _Path(args.sota)
    if not sota.exists():
        print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
        return 2

    citations_json_path = _Path(args.citations_json)
    if not citations_json_path.exists():
        print(f"[ERR] JSON citations introuvable : {citations_json_path}",
              file=sys.stderr)
        return 2

    raw_json = citations_json_path.read_text(encoding="utf-8")
    data = json.loads(raw_json)
    citations = [ParsedCitation(**c) for c in data]
    report = id_mod.identify_sota(sota, citations)

    apply = bool(getattr(args, "apply", False))
    if apply:
        if not _ensure_git_backup(VAULT,
                                  f"paper-trail linkify before {sota.name}"):
            print("[ERR] backup git impossible. Annulation.", file=sys.stderr)
            return 2

    result = link_mod.linkify_sota(sota, report, apply=apply)

    if getattr(args, "json_output", False):
        from dataclasses import asdict
        out = {
            "sota": str(sota),
            "apply": apply,
            "n_pdf_wikilinks": result.n_pdf_wikilinks,
            "n_anchor_wikilinks": result.n_anchor_wikilinks,
            "total_substitutions": result.total_substitutions(),
            "n_statut_entries": len(result.statut_entries),
            "statut_entries": [asdict(e) for e in result.statut_entries],
            "errors": result.errors,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"\n=== Linkify : {sota.name} ===")
        print(f"  Mode: {'APPLY' if apply else 'DRY-RUN'}")
        print(f"  PDF wikilinks    : {result.n_pdf_wikilinks}")
        print(f"  Anchor wikilinks : {result.n_anchor_wikilinks}")
        print(f"  Statut entries   : {len(result.statut_entries)}")
        if result.errors:
            print(f"  Errors           : {len(result.errors)}")
            for e in result.errors[:3]:
                print(f"    {e}")
    return 1 if result.errors else 0


def cmd_purge(args: argparse.Namespace) -> int:
    """Nettoie les wikilinks invalides d'un SOTA.

    6 cas détectés (cf. pipeline/purge.py) :
      - wikilink vers ref retracted (avec ou sans merge_into)
      - wikilink vers `_0000_*` ayant un sibling complet
      - wikilink avec suffixe numérique moche `_2_3_4`
      - wikilink vers fichier technique (20_ATLAS/, 30_DEV/, .canvas)
      - wikilink vers slug non-bibliographique (IR_Spec_Preliminaire etc.)

    Modes :
      - défaut : dry-run, affiche le plan
      - --apply : applique + backup git auto
      - --json : sortie JSON structurée
    """
    from . import purge as purge_mod
    from .ingest import _ensure_git_backup
    from pathlib import Path as _Path

    sota = _Path(args.sota)
    if not sota.exists():
        print(f"[ERR] SOTA introuvable : {sota}", file=sys.stderr)
        return 2

    result = purge_mod.plan_purge(sota)
    apply = bool(getattr(args, "apply", False))
    json_output = bool(getattr(args, "json_output", False))

    if apply:
        from .config import VAULT
        if not _ensure_git_backup(VAULT, f"paper-trail purge before {sota.name}"):
            print("[ERR] backup git impossible. Annulation.", file=sys.stderr)
            return 2
        purge_mod.apply_purge(result)

    if json_output:
        out = {
            "sota": str(sota),
            "apply": apply,
            "n_actions": len(result.actions),
            "n_applied": result.n_applied,
            "by_reason": result.by_reason(),
            "actions": [
                {
                    "line_no": a.line_no,
                    "raw_wikilink": a.raw_wikilink,
                    "reason": a.reason.value,
                    "replacement": a.replacement,
                    "sibling_slug": a.sibling_slug,
                }
                for a in result.actions
            ],
            "errors": result.errors,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 1 if result.errors else 0

    # Format texte humain
    by_reason = result.by_reason()
    print(f"\n=== Purge plan : {sota.name} ===")
    print(f"  Mode: {'APPLY' if apply else 'DRY-RUN'}")
    print(f"  Total wikilinks invalides : {len(result.actions)}")
    if by_reason:
        for reason, count in sorted(by_reason.items()):
            print(f"    {reason:35s} : {count}")
    if result.actions:
        print(f"\n  Details (max 15):")
        for a in result.actions[:15]:
            note = (f"→ {a.sibling_slug}" if a.sibling_slug
                    else "→ strip" if a.replacement is None
                    else f"→ {a.replacement}")
            print(f"    L{a.line_no:>4}  {a.raw_wikilink:<60}  "
                  f"{a.reason.value} {note}")
    if apply:
        print(f"\n  Applied: {result.n_applied}")
    else:
        print(f"\n  Dry-run. Use --apply to execute.")
    if result.errors:
        print(f"\n  Errors: {len(result.errors)}")
        for e in result.errors[:3]:
            print(f"    {e}")
    return 1 if result.errors else 0


def cmd_retract_uncited(args: argparse.Namespace) -> int:
    """Retract en lot toutes les refs actives non citées hors registre INDEX.

    Une ref `candidate`, `uid_resolved` ou `awaiting_rtfm_ocr` qui n'est
    citée dans aucune SOTA ni article du vault n'a aucun impact si on la
    retract. Empiriquement c'est 95% des cas problématiques.

    Mode dry-run par défaut : montre la liste et compte, ne mute rien.
    Avec --apply : exécute les retract avec une raison standard.
    """
    from .registry import load_ref, save_ref, append_state_history
    from tools.review_problems import build_citations_index
    from datetime import datetime, timezone

    active_states = {"candidate", "uid_resolved", "awaiting_rtfm_ocr"}
    print("Scanning the vault for citations...", file=sys.stderr)
    citations_idx = build_citations_index()

    candidates = []
    for ref in iter_refs():
        if ref.state not in active_states:
            continue
        cites = citations_idx.get(ref.slug, [])
        real_cites = [c for c in cites if "INDEX.md" not in str(c[0])]
        if real_cites:
            continue
        candidates.append(ref)

    print(f"\n{len(candidates)} active refs uncited outside INDEX")
    for ref in candidates:
        author = ref.frontmatter.get("author") or "?"
        year = ref.frontmatter.get("year") or "?"
        print(f"  [{ref.state:<20}] {ref.slug:<50}  {author} ({year})")

    if not candidates:
        return 0

    if not getattr(args, "apply", False):
        print(f"\nDry-run (use --apply to retract these {len(candidates)} refs)")
        return 0

    reason = (getattr(args, "reason", None) or
              "auto-retract: not cited in any SOTA or article (only in registry INDEX)")
    n_ok = 0
    n_err = 0
    n_sota_sub = 0
    n_sota_files = set()
    for ref in candidates:
        from_state = ref.state
        try:
            append_state_history(ref, "retracted", by="auto_retract_uncited",
                                 meta={"reason": reason})
            ref.frontmatter["retracted_reason"] = reason
            ref.frontmatter["retracted_at"] = datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ")
            save_ref(ref)
            append_event(ref.slug, from_state, "retracted",
                         "retract_uncited", {"reason": reason})
            n_ok += 1
            # Propagation cohérence : defense-in-depth. Par construction,
            # retract_uncited ne cible que des refs non citées, donc sync
            # devrait être no-op. Mais si l'index a une stale entry, on
            # garde au moins la trace (Phase 2 du plan refonte INGEST).
            try:
                from .sota_sync import update_wikilinks_in_sotas
                sync = update_wikilinks_in_sotas(
                    old_slug=ref.slug, new_slug=None,
                    reason=f"retract_uncited:{reason[:60]}",
                    skip_git_backup=True,  # backup global déjà fait en amont
                )
                n_sota_sub += sync.total_substitutions
                n_sota_files.update(sync.sotas_touched)
            except Exception as e:
                print(f"[WARN] sota_sync {ref.slug} : {e}", file=sys.stderr)
        except Exception as e:
            print(f"[ERR] {ref.slug}: {type(e).__name__}: {e}", file=sys.stderr)
            n_err += 1
    print(f"\nRetracted: {n_ok}/{len(candidates)} (errors: {n_err})")
    if n_sota_sub > 0:
        print(f"Sync: {n_sota_sub} wikilink(s) removed in "
              f"{len(n_sota_files)} SOTA(s)")
    return 1 if n_err else 0


def cmd_reactivate_ocr(args: argparse.Namespace) -> int:
    """Re-évalue les refs `awaiting_rtfm_ocr` via `rtfm check --path`.

    Boucle dédiée séparée de `run` : on cible explicitement ce state.
    Pour chaque ref :
      - rtfm check --path <pdf_path>
      - dispatch selon verdict (ok / still_pending / missing / anomaly / ocr_failed)
      - mute le frontmatter (last_rtfm_check_at, state si transition, journal append)

    Sortie : récap compté par verdict.
    """
    from .transitions import awaiting_rtfm_ocr_dispatch

    counts = {"converted": 0, "still_pending": 0, "missing_in_index": 0,
              "anomaly": 0, "ocr_failed": 0, "needs_reacq_post_ocr": 0,
              "error": 0}
    total = 0
    verbose = getattr(args, "verbose", False) or not getattr(args, "quiet", False)

    for ref in iter_refs():
        if ref.state != "awaiting_rtfm_ocr":
            continue
        total += 1
        try:
            res = awaiting_rtfm_ocr_dispatch(ref)
        except Exception as e:
            counts["error"] += 1
            append_blocked(ref.slug, ref.state, f"reactivate_ocr_crash:{type(e).__name__}:{e}")
            if verbose:
                print(f"[crash] {ref.slug}: {type(e).__name__}: {e}",
                      file=sys.stderr)
            continue

        if res.to_state == "page1_validated":
            counts["converted"] += 1
            append_event(ref.slug, "awaiting_rtfm_ocr", "page1_validated",
                         res.via, res.meta)
            if verbose:
                print(f"[converted] {ref.slug:<55} → page1_validated  "
                      f"(chunks={res.meta.get('chunks') if res.meta else '?'})")
        elif res.to_state == "needs_reacquisition":
            if res.via == "rtfm_ocr_failed":
                counts["ocr_failed"] += 1
            else:
                counts["needs_reacq_post_ocr"] += 1
            append_event(ref.slug, "awaiting_rtfm_ocr", "needs_reacquisition",
                         res.via, res.meta)
            if verbose:
                print(f"[reacq] {ref.slug:<55} → needs_reacquisition "
                      f"({res.via})")
        else:
            # Pas de transition — still_pending, missing_in_index, anomaly
            via = res.via or "unknown"
            if "still_pending" in via:
                counts["still_pending"] += 1
            elif "missing" in via:
                counts["missing_in_index"] += 1
            elif "anomaly" in via:
                counts["anomaly"] += 1
            append_blocked(ref.slug, "awaiting_rtfm_ocr",
                           res.blocked_reason or via)
            if verbose:
                print(f"[wait] {ref.slug:<55} {via}")

    print()
    print(f"# reactivate-ocr — {total} refs in awaiting_rtfm_ocr scanned")
    for k in ("converted", "still_pending", "missing_in_index", "anomaly",
              "ocr_failed", "needs_reacq_post_ocr", "error"):
        print(f"  {k:<25} {counts[k]:>4}")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """Lance les checks d'invariants I1-I19 et affiche le rapport.

    Options :
      --fix             : applique les fix_fn auto_fixable (I4 R8, I6 sha
                          recompute, I9 renumber, I5 semi semi → needs_reacquisition)
      --severity X      : filtre min "info" / "warn" / "error" (défaut: info)
      --json            : sortie JSON machine-readable
      --correlate-rtfm  : active Couche 5 — I16/I17/I19 (corrélation RTFM,
                          appels CLI rtfm)
      --check-sha       : active I18 (recompute sha256 sur les PDFs, lent)
    """
    severity = getattr(args, "severity", None) or "info"
    rc, out = run_doctor_for_cli(
        refs=None,
        apply_fix=getattr(args, "fix", False),
        min_severity=severity,
        as_json=getattr(args, "json", False),
        correlate_rtfm=getattr(args, "correlate_rtfm", False),
        check_sha=getattr(args, "check_sha", False),
    )
    print(out)
    if rc != 0:
        print(f"\n[doctor] returncode={rc} — at least 1 ERROR detected",
              file=sys.stderr)
    return rc


def cmd_events(args: argparse.Namespace) -> int:
    """Lit le journal JSONL et affiche les transitions filtrées.

    Filtres :
      --since DATE       (ISO date, journée UTC inclusive)
      --to STATE         (état cible exact dans la transition)
      --cited-in SOTA    (intersection avec refs dont cited_in[].name == SOTA)
      --json             (sortie machine-readable)
    """
    since_date = None
    if args.since:
        try:
            since_date = events_mod._parse_iso_date(args.since)
        except ValueError:
            print(f"[events] --since invalide : {args.since!r} "
                  f"(attendu YYYY-MM-DD)", file=sys.stderr)
            return 2

    raw = events_mod.iter_events(since=since_date)
    filtered = events_mod.filter_events(
        raw,
        to_state=args.to,
        cited_in=args.cited_in,
    )

    if args.json:
        print(json.dumps(filtered, ensure_ascii=False, indent=2))
    else:
        print(events_mod.render_text(
            filtered, since_date, args.to, args.cited_in,
        ))
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m pipeline",
        description="Strict worker FSM for the SOTA pipeline — see plans/B_worker_FSM_pipeline.md",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pst = sub.add_parser("status", help="Count refs by state")
    pst.set_defaults(func=cmd_status)

    pln = sub.add_parser("lint", help="Run lint_registry.py (invariants R1-R10)")
    pln.set_defaults(func=cmd_lint)

    prn = sub.add_parser("run", help="Push active refs to their next state")
    prn.add_argument("--state", help="Filter: process one state only")
    prn.add_argument("--ref", metavar="SLUG[,SLUG...]",
                     help="Filter: process only these refs (comma-separated "
                          "slugs). Use it to acquire a few new references "
                          "without replaying every known failure.")
    prn.add_argument("--cited-in", action="append", default=[],
                     help="OR filter: refs cited by this SOTA/paper (repeatable)")
    prn.add_argument("--limit", type=int, default=0,
                     help="Max refs processed (0 = no limit)")
    prn.add_argument("--dry-run", action="store_true",
                     help="Print the plans without mutating")
    prn.add_argument("--no-lint", action="store_true",
                     help="Skip the final lint")
    prn.add_argument("--no-doctor", action="store_true",
                     help="Skip the doctor invariants I1-I15 at end of run")
    prn.add_argument("--retry-exhausted", action="store_true",
                     help="Lift `cascade_exhausted_needs_manual` locks before "
                          "the pass (automatic resumption; locks placed by a "
                          "human are left untouched)")
    prn.add_argument("-v", "--verbose", action="store_true")
    prn.add_argument("--loop", action="store_true",
                     help="Loop until exhaustion: re-run while transitions "
                          "remain possible (max --max-iterations).")
    prn.add_argument("--max-iterations", type=int, default=10,
                     help="Iteration cap in --loop mode (default 10).")
    prn.set_defaults(func=cmd_run)

    pra = sub.add_parser("reactivate-ocr",
                         help="Re-evaluate awaiting_rtfm_ocr refs via rtfm check")
    pra.add_argument("--quiet", action="store_true")
    pra.set_defaults(func=cmd_reactivate_ocr)

    prt = sub.add_parser("resolve-textbooks",
                         help="Resolve textbook refs ingested without year/title")
    prc = sub.add_parser("registry-cleanup",
                         help="Historical registry cleanup (including duplicates "
                              "with numeric suffixes _2_3_4)")
    prc.add_argument("--list", dest="list_candidates", action="store_true",
                     help="List cleanup candidates (JSON)")
    prc.add_argument("--apply-from", dest="apply_from",
                     help="JSON of decisions to apply "
                          "(same format as resolve-textbooks)")
    prc.set_defaults(func=cmd_registry_cleanup)

    prt.add_argument("--list", dest="list_candidates", action="store_true",
                     help="List candidate refs as JSON on stdout")
    prt.add_argument("--apply-from", dest="apply_from",
                     help="Path to a JSON of decisions to apply")
    prt.set_defaults(func=cmd_resolve_textbooks)

    psr = sub.add_parser("search",
                         help="Search the validated registry")
    psr.add_argument("query", help="Term to search for (author, title, year, slug)")
    psr.add_argument("--include-pending", action="store_true",
                     help="Also include page1_validated refs (not only sota_cited_confirmed)")
    psr.add_argument("--limit", type=int, default=50, help="Max number of results")
    psr.set_defaults(func=cmd_search)

    pin = sub.add_parser("ingest",
                         help="Ingest a SOTA's citations into the registry")
    pin.add_argument("sota", nargs="?", default=None,
                     help="Path of the SOTA to ingest (unless --init-git or --all)")
    pin.add_argument("--init-git", action="store_true",
                     help="Initialise git in the vault (first time)")
    pin.add_argument("--extract-only", action="store_true",
                     help="List bibliographic sections as JSON on stdout, ingest nothing")
    pin.add_argument("--citations-json",
                     help="Path to a JSON of citations already parsed by the sub-agent")
    pin.add_argument("--apply", action="store_true",
                     help="Apply the ingestion (create refs + substitute). Without it: dry-run.")
    pin.add_argument("--all", dest="all_sotas", action="store_true",
                     help="Scan every SOTA in the vault (dry-run by default)")
    pin.add_argument("--json", dest="json_output", action="store_true",
                     help="Structured JSON output (metrics) instead of the human "
                          "summary. For scripting and test fixtures.")
    pin.set_defaults(func=cmd_ingest)

    ppu = sub.add_parser("purge",
                         help="Clean a SOTA's invalid wikilinks (retracted, "
                              "_0000_*, ugly suffixes, technical paths)")
    ppu.add_argument("sota", help="Path of the SOTA to purge")
    ppu.add_argument("--apply", action="store_true",
                     help="Apply the plan (default: dry-run, prints)")
    ppu.add_argument("--json", dest="json_output", action="store_true",
                     help="Structured JSON output for scripting")
    ppu.set_defaults(func=cmd_purge)

    pid = sub.add_parser("identify",
                         help="Identification report for a SOTA (read-only)")
    pid.add_argument("sota", help="Path of the SOTA to analyse")
    pid.add_argument("--citations-json", required=True,
                     help="JSON of parsed citations (citation-parser sub-agent)")
    pid.add_argument("--json", dest="json_output", action="store_true",
                     help="Structured JSON output for scripting")
    pid.set_defaults(func=cmd_identify)

    pac = sub.add_parser("acquire",
                         help="PDF cascade targeted at one SOTA's refs")
    pac.add_argument("sota", help="Path of the SOTA")
    pac.add_argument("--citations-json",
                     help="Parsed JSON (optional, adds would_create slugs)")
    pac.add_argument("--apply", action="store_true",
                     help="Execute the transitions (default: dry-run)")
    pac.add_argument("--json", dest="json_output", action="store_true",
                     help="Structured JSON output")
    pac.set_defaults(func=cmd_acquire)

    pli = sub.add_parser("linkify",
                         help="Insert wikilinks (PDF/anchor) + the "
                              "`## Statut des sources` section")
    pli.add_argument("sota", help="Path of the SOTA to linkify")
    pli.add_argument("--citations-json", required=True,
                     help="JSON of parsed citations (citation-parser sub-agent)")
    pli.add_argument("--apply", action="store_true",
                     help="Apply (mutates the SOTA + git backup)")
    pli.add_argument("--json", dest="json_output", action="store_true",
                     help="Structured JSON output")
    pli.set_defaults(func=cmd_linkify)

    pru = sub.add_parser("retract-uncited",
                         help="Bulk-retract active refs uncited outside INDEX")
    pru.add_argument("--apply", action="store_true",
                     help="Execute the retractions (default: dry-run)")
    pru.add_argument("--reason", default=None,
                     help="Custom reason recorded in the journal")
    pru.set_defaults(func=cmd_retract_uncited)

    par = sub.add_parser("arbitrate",
                         help="Human decision on a problematic ref")
    par.add_argument("slug", help="Slug of the ref to arbitrate")
    par.add_argument("--decision", required=True,
                     choices=("retract", "blocked", "investigate",
                              "unblock", "reject-pdf"),
                     help="retract: artefact; blocked: paywall/inaccessible; "
                          "investigate: fix frontmatter then re-run; "
                          "unblock: lift blocked_by and retry the cascade; "
                          "reject-pdf: wrong source identified (TOC, wrong "
                          "edition) — quarantine + cascade re-run")
    par.add_argument("--reason", default="",
                     help="Short sentence justifying the decision (logged)")
    par.set_defaults(func=cmd_arbitrate)

    pdo = sub.add_parser("doctor",
                         help="Run invariants I1-I19 (worker overlay)")
    pdo.add_argument("--fix", action="store_true",
                     help="Apply the auto-fixable fix_fn (I4 path, I6 sha, "
                          "I9 renum, I5 semi, I22 orphan wikilink, "
                          "I23 retracted wikilink)")
    pdo.add_argument("--severity", choices=("info", "warn", "error"),
                     default="info",
                     help="Minimum severity filter (default: info = show everything)")
    pdo.add_argument("--json", action="store_true",
                     help="Sortie JSON machine-readable")
    pdo.add_argument("--correlate-rtfm", action="store_true",
                     dest="correlate_rtfm",
                     help="Enable Layer 5 — I16/I17/I19 (RTFM correlation, "
                          "calls the `rtfm failed` CLI)")
    pdo.add_argument("--check-sha", action="store_true",
                     dest="check_sha",
                     help="Enable I18 — recompute sha256 on every affected "
                          "PDF (slow, opt-in)")
    pdo.set_defaults(func=cmd_doctor)

    pev = sub.add_parser("events",
                         help="Read the filtered JSONL journal (Layer 3)")
    pev.add_argument("--since",
                     help="Inclusive ISO date (YYYY-MM-DD), filters by UTC day")
    pev.add_argument("--to", dest="to",
                     help="Filter by target state (e.g. page1_validated)")
    pev.add_argument("--cited-in", dest="cited_in",
                     help="Intersect with refs whose cited_in[].name == value")
    pev.add_argument("--json", action="store_true",
                     help="Sortie machine-readable JSON")
    pev.set_defaults(func=cmd_events)

    return p


# Sous-commandes qui mutent le registre — protégées par WorkerLock pour
# éviter 2 sessions concurrentes. Les read-only (status, lint, doctor, events)
# ne sont PAS wrappées.
_MUTATING_CMDS = {"run", "reactivate-ocr", "purge", "linkify", "acquire"}


def main(argv: list[str] | None = None) -> int:
    # Une passe dure des minutes. Quand la sortie est redirigée — travail
    # planifié, journal — Python tamponne par blocs et rien ne s'affiche
    # avant la fin : impossible de savoir si l'outil travaille ou s'il est
    # bloqué. On repasse en tampon par ligne.
    with contextlib.suppress(AttributeError, ValueError):
        sys.stdout.reconfigure(line_buffering=True)
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.cmd in _MUTATING_CMDS:
        try:
            with WorkerLock():
                return args.func(args)
        except LockBusyError as e:
            print(f"[lock] {e}", file=sys.stderr)
            return 2
    return args.func(args)
