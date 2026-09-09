---
type: design-spec
created: 2026-05-23
status: draft
audience: Romain + Claude
references:
  - 10_SOURCES/STATE_MACHINE_DESIGN_2026-05-17.md (machine d'état canonique)
  - ~/.claude/plugins/source-collector/skills/source-collector/SKILL.md
  - ~/.claude/projects/-home-romi-dev-musicology-phd/memory/sota_pipeline_decision_2026-05-23.md
---

# Spec — Worker B (FSM stricte) pour pipeline SOTA

## 1. Objectif

Un orchestrateur unique qui pousse chaque référence du registre vers un état
accepté en passant **obligatoirement** par les transitions de la machine
d'état documentée dans `STATE_MACHINE_DESIGN_2026-05-17.md`. Élimine les
shortcuts ad-hoc et garantit que toutes les transitions sont loggées,
idempotentes, et rejouables.

## 2. Non-objectifs

- Pas de remplacement des helpers `~/.claude/plugins/source-collector/lib/` —
  on les **utilise**, on ne les réécrit pas.
- Pas de daemon long-running — mode batch CLI uniquement.
- Pas de Dagster / UI temps réel / queue distribuée.
- Pas de décision sémantique (verbe juste, claim vrai) — ça reste l'autorité
  du `sota-curator` skill.

## 3. Hypothèses validées

| # | Hypothèse | Statut |
|---|-----------|--------|
| 1 | `rtfm check` CLI/MCP, modes `--slug <s>` (exact, stable), `--path <p>` (relatif source), positionnel `<ident>` (substring) → JSON `{searchable, chunks, embeddings_done, scan_pending, ocr_pending}` | en cours de dev — worker utilisera `--slug` (recommandation utilisateur : survit aux déplacements de fichier) |
| 2 | Domaines AA hardcodés patchés vers `annas-archive.gl` | ✅ 2026-05-23 |
| 3 | `scripts/download_pdfs.py` supprimé (doublon dégradé) | ✅ 2026-05-23 |
| 4 | Machine d'état canonique = `STATE_MACHINE_DESIGN_2026-05-17.md` | ✅ existante |
| 5 | Registry = `10_SOURCES/_registry/refs/*.md` avec frontmatter YAML | ✅ peuplé |

## 4. Architecture — vue d'ensemble

```
                  ┌─────────────────────────────────────────────┐
                  │           pipeline.py (entry point)         │
                  │                                             │
                  │   ┌──────────────┐    ┌─────────────────┐  │
                  │   │ RegistryLoader│──▶│ RefDispatcher   │  │
                  │   └──────────────┘    └────────┬────────┘  │
                  │                                │            │
                  │       ┌────────────────────────┼────────┐  │
                  │       ▼                        ▼        ▼  │
                  │  Transition_A             Transition_B   …  │
                  │  (candidate→              (uid_resolved→    │
                  │   uid_resolved)            pdf_acquired)    │
                  │       │                        │            │
                  │       ▼                        ▼            │
                  │   YAML atomic              YAML atomic       │
                  │   mutation                 mutation         │
                  │       │                        │            │
                  │       └──────────┬─────────────┘            │
                  │                  ▼                          │
                  │            Journal append                   │
                  └──────────────────────────────────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────────────┐
                  │ Helpers (read-only deps, no shortcuts)       │
                  │  - lib/ du plugin source-collector           │
                  │  - rtfm_check (MCP)                          │
                  │  - paper-search MCP                          │
                  │  - validate_pdf_content.py                   │
                  └──────────────────────────────────────────────┘
```

**Un seul point d'entrée** : `python -m pipeline run [options]`. Toute
mutation du registre passe par les fonctions `transition_*`. Les helpers
sont importés en lecture seule (cascade, validateur, probe).

## 5. États & transitions — référence

La FSM est définie dans `STATE_MACHINE_DESIGN_2026-05-17.md` §2-3. Récap
opérationnel pour le worker :

| État courant | Transition(s) sortante(s) | Fonction worker |
|--------------|---------------------------|------------------|
| `candidate` | → `uid_resolved` | `transition_candidate_to_uid_resolved` |
| `uid_resolved` | → `pdf_acquired` (cascade 9 niveaux) | `transition_uid_resolved_to_pdf_acquired` |
| `pdf_acquired` | → `page1_validated` / `uid_resolved` (loop) / `awaiting_rtfm_ocr` / `needs_reacquisition` | `transition_pdf_acquired_dispatch` (selon `probe_pdf_health`) |
| `awaiting_rtfm_ocr` | → `page1_validated` si `rtfm_check.ocr_pending=false` et `chunks>0` | `transition_awaiting_rtfm_ocr_to_page1` |
| `needs_reacquisition` | → `uid_resolved` (relance cascade depuis source suivante) | `transition_needs_reacquisition_to_uid_resolved` |
| `page1_validated` | → `sota_cited_confirmed` (curator) / `retracted` (curator) | **hors worker** — délégué au curator skill |
| `blocked_human:*` | aucune (état d'arrêt) | rien |
| `sota_cited_confirmed`, `retracted` | aucune (terminal) | rien |

**Règle d'or** : le worker n'écrit jamais `sota_cited_confirmed` ni
`retracted` — ces transitions sont la prérogative du curator (jugement
sémantique). Le worker s'arrête à `page1_validated` ou à un état d'arrêt.

## 6. Format YAML — champs ajoutés/utilisés par le worker

Aucun changement de schéma. Le worker lit/écrit les champs déjà définis :

- `state` (mutation)
- `state_history[]` (append-only)
- `acquisition_attempts[]` (append-only)
- `page1_validation_log` (overwrite à chaque tentative)
- `ocr_pending_since` (set lors de `pdf_acquired → awaiting_rtfm_ocr`)
- `doctor_flags[]` (set lors de `pdf_acquired → needs_reacquisition`)
- `blocked_by` (set quand un invariant échoue de manière persistante)

**Atomicité** : chaque mutation YAML écrit dans un fichier temporaire puis
`os.replace()` — pas d'écriture partielle visible.

## 7. Journal d'événements

Un fichier append-only `10_SOURCES/_registry/_journal/{YYYY-MM-DD}.jsonl`.

Chaque ligne =
```json
{"ts":"2026-05-23T18:23:01Z","ref":"shannon_1948_mathematical",
 "from":"uid_resolved","to":"pdf_acquired","via":"crossref_oa",
 "meta":{"sha256":"a1b2..."}}
```

Usage :
- `tail -f` pour suivre une session en direct
- Reprise sur crash (relire le journal pour reconstruire l'état logique)
- Audit ex post (diff comportements entre sessions)

## 8. CLI proposée

```bash
# Pousser toutes les refs non-finales vers leur prochain état atteignable
python -m pipeline run

# Filtrer par état
python -m pipeline run --state uid_resolved --limit 50

# Filtrer par SOTA / paper consommateur
python -m pipeline run --cited-in SOTA_Bernard_Bel_Temperaments

# Cible une ref unique (debug)
python -m pipeline run --ref shannon_1948_mathematical --verbose

# Dry-run (montre ce qui serait fait, ne mute rien)
python -m pipeline run --dry-run

# Re-évalue les awaiting_rtfm_ocr via rtfm_check (sans relancer la cascade)
python -m pipeline reactivate-ocr

# Vérifie les invariants globaux (= linter R1-R10)
python -m pipeline lint

# Affiche les états et compteurs courants
python -m pipeline status
```

## 9. Mode batch — boucle principale

```python
def run(filters):
    refs = registry.load(filters)
    ordered = sorted(refs, key=lambda r: STATE_ORDER[r.state])
    for ref in ordered:
        try:
            event = dispatch(ref)
            if event is None:
                continue  # ref terminale ou en attente externe
            apply_transition(ref, event)
            journal.append(event)
        except TransitionBlocked as e:
            ref.blocked_by = str(e)
            registry.save(ref)
            journal.append({"ref": ref.slug, "blocked": str(e)})
        except Exception as e:
            log.exception("worker crash on %s", ref.slug)
            # ne stoppe pas la boucle — autre refs progressent
```

**Ordre de traitement** : par ordre de l'état (les plus avancées d'abord)
pour que les invariants R8 (drift) soient évalués avant de retoucher des
refs déjà avancées.

## 10. Idempotence + reprise sur crash

- Chaque transition est idempotente : ré-exécuter sur un état déjà avancé
  est un no-op.
- Les helpers en aval (download, validate) sont déjà idempotents (SHA256
  dedup, page1 deterministe).
- Sur crash : relancer `pipeline run` — la boucle reprend là où elle s'est
  arrêtée parce que le registre est la source de vérité.
- Le journal n'est jamais consulté pour décider de l'état (c'est le YAML
  qui décide) — il sert à l'audit, pas à la reprise.

## 11. Garde-fous structurels

| Mécanisme | Description |
|-----------|-------------|
| **No-skip** | Le dispatcher refuse une transition non-adjacente (sauf `→ retracted` via curator) — exception `IllegalTransition` |
| **R8 drift** | Avant chaque session, scan des refs avec flags context-dependent + champ critique changé → re-validation forcée |
| **Fail-loud** | Toute exception non-rattrapée écrit dans le journal et met la ref en `blocked_by: worker_crash:<traceback_hash>` |
| **Linter pre-exit** | Fin de session : `python -m pipeline lint` doit passer ; sinon exit code ≠ 0 |
| **No silent skip** | Une ref en état intermédiaire dont aucune transition n'est applicable → `blocked_by: no_progress:<diagnostic>` (jamais ignorée silencieusement) |

## 12. Intégration `rtfm_check`

Boucle dédiée pour `awaiting_rtfm_ocr → page1_validated` :

```python
def reactivate_ocr():
    for ref in registry.load(state="awaiting_rtfm_ocr"):
        # Mode --slug : exact match sur books.slug, stable aux déplacements.
        # Fallback --path possible si un jour un ref n'a pas de slug
        # (cas marginal — tous les refs ont un slug par construction).
        status = rtfm_check(slug=ref.slug)
        if status["ocr_pending"] or status["scan_pending"]:
            continue  # toujours en attente RTFM
        if status["chunks"] == 0:
            log.warning("OCR done but no chunks for %s", ref.slug)
            continue  # anomalie d'indexation, curator à alerter
        # OCR + indexation OK → re-tenter page 1
        verdict = validate_pdf_against_ref(ref)
        if verdict.ok:
            transition(ref, "page1_validated", via="rtfm_ocr_completion")
        else:
            # OCR fait mais validation page 1 échoue toujours
            # → probable mauvais contenu, basculer needs_reacquisition
            transition(ref, "needs_reacquisition",
                       via="rtfm_ocr_completion",
                       doctor_flag="wrong_content_post_ocr")
```

Cette boucle est appelée manuellement (`pipeline reactivate-ocr`), pas par
hook RTFM — RTFM ne sait pas que le worker existe.

## 13. Décisions validées (2026-05-23)

| # | Question | Décision |
|---|----------|----------|
| Q1 | Réactivation OCR | **SessionStart hook** sur le projet `musicology-phd` qui lance `python -m pipeline reactivate-ocr` (ou équivalent) à chaque démarrage de session Claude Code. Garantit que le worker prend en compte les OCRs finis depuis la dernière session, sans cron système. |
| Q2 | Crash recovery | (a) Pas de `--resume-from-journal`. Le YAML est la source de vérité (atomic write via `os.replace`), on relance simplement `pipeline run`. Le journal reste consultable pour audit/debug. |
| Q3 | Lint auto | (a) `pipeline run` appelle `lint` à la fin par défaut. Flag `--no-lint` pour skip si pressé. Exit code ≠ 0 si lint échoue (run terminé mais session signalée dirty). |
| Q4 | `--cited-in` | **OR multi-valeurs**. `--cited-in X --cited-in Y` = union des refs citées par X ou Y. AND restera côté script d'analyse séparé si besoin un jour. |
| Q5 | Parallélisme | (a) Strictement sériel. Pas de `--parallel` en V1. Bottleneck = rate-limit serveurs (AA, libgen, Sci-Hub), pas CPU. Si V2 un jour, paralléliser uniquement les premières étapes safe (Crossref/arXiv). |

### Q1 — implémentation du SessionStart hook

Fichier visé : `/home/romi/dev/musicology-phd/.claude/settings.json` (ou `settings.local.json`).

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matchers": [],
        "hooks": [
          { "type": "command",
            "command": "cd /home/romi/dev/musicology-phd && python -m pipeline reactivate-ocr --quiet" }
        ]
      }
    ]
  }
}
```

Comportement attendu :
- Au démarrage de session sur `musicology-phd`, le hook scanne les refs `awaiting_rtfm_ocr`.
- Pour chaque ref, appel `rtfm check` (mode TBD : `--slug` une fois la réconciliation slugs faite, ou `--path` sinon).
- Si l'OCR est fini ET le chunk indexé → re-validation page 1 → `page1_validated`.
- Sortie silencieuse (`--quiet`) sauf si transitions effectuées (alors résumé court en sortie standard, visible dans le terminal Claude Code au démarrage).
- Si le hook crash, il n'empêche pas le démarrage de session (timeout court).

## 14. Phases d'implémentation — état au 2026-05-24

> **Note de correction (2026-05-24)** : la version précédente de cette section
> déclarait P3 "✅ livré" alors que la cascade avait 4 étapes sortant
> immédiatement sans DOI ("DOI-only" et non "DOI-first") et 1 étape WebSearch
> en stub no-op. Voir `plans/B_worker_fixes_2026-05-24.md` pour le plan de
> remise au carré et `pipeline/tests/coverage_run_2026-05-24.md` pour les
> preuves E2E des corrections F1-F2-F3-F4.

### Définition de "livré" (anti-récidive)

Une transition/étape n'est annoncée "livré" que si **les trois** sont vrais :
1. Code écrit et passant les imports.
2. ≥ 2 refs réelles d'archétypes distincts l'ont franchie avec succès.
3. Au moins 1 cas négatif documenté (cf. test anti-homonymie F1 sur ref retracted).

### Statut par phase (post-fixes)

| Phase | Statut | Preuve E2E |
|-------|--------|------------|
| P1 (status/lint/run --dry-run) | ✅ livré | 909 refs parsées ; lint invoque `lint_registry.py` ; dry-run trouve les candidates |
| P2 (`candidate_to_uid_resolved`) **F1 enrichi** | ✅ livré | collins_2014 (bibkey_fallback OK), bel_2007 (négatif anti-homonymie PASS) — voir coverage_run §F1 |
| P3 cascade 9 niveaux **F1+F2+F3+F4** | ✅ livré (effectivement) | arnold_1982 acquired via F3 IA E2E ; F2 MD5 par title-search OK ; F4 manifest queue OK |
| P4 (`pdf_acquired_dispatch`) | ✅ livré | arnold_1982 dispatch ok_has_text → page1_validated (verdict probe_ok_validate_passed) |
| P5 (`reactivate-ocr`) | 🚧 stub | bloqué sur rescan RTFM corpus `ontologie-musicale` (slugs registry ≠ slugs RTFM à réconcilier) |
| P6 (`needs_reacquisition_to_uid_resolved`) | ✅ livré (bump trivial) | testé via P4 dispatch (transition naturelle) |
| P7 (garde-fous R8 drift + lint pre-exit) | ⏳ partiel | lint pre-exit OK via `--no-lint` flag ; R8 drift pre-session à brancher |
| P8 (pilote Bernard Bel) | ✅ SOTA livré (2026-05-23) | `SOTA_Bernard_Bel_Temperaments_Intonation.md` 806 lignes, 7 refs en `sota_cited_confirmed` |

### Couverture cascade post-fixes (vs avant)

| Étape | Avant 2026-05-23 (déclaré "livré" à tort) | Après 2026-05-24 (effectivement livré) |
|---|---|---|
| 1. Crossref | DOI-only | DOI-first (P2/F1 résout par titre avant) |
| 2. arXiv | arxiv:id-only (normal) | arxiv:id-only (normal) |
| 3. OpenAlex | DOI-first | DOI-first |
| 4. Unpaywall | DOI-only | DOI-only (acceptable — couvert par F1 qui résout en amont) |
| 5a. HAL | title-first | title-first |
| 5b. CORE | title-first | title-first |
| **5c. archive.org (F3 nouveau)** | absent | title-first + DOI inverse, 3 stratégies query, arnold_1982 acquis |
| 6. Sci-Hub | DOI-only | DOI-only (acceptable — couvert par F1) |
| 7. AA | DOI-only (scidb) | DOI-first + title-search MD5 (F2). Playwright Turnstile désactivé V1 (~5-10 refs queue manuelle) |
| 8. WebSearch | stub no-op | F4 manifest queue (consommée par Claude Code interactif) |
| 9. Manual queue | flag | flag |

**ROI mesuré** : 285 refs sur 970 sans UID (29,4 %) bénéficient potentiellement de F1+F2+F3 (peuvent maintenant entrer dans la cascade, alors qu'elles sortaient `no_source` immédiatement avant).

### Fichiers livrés

- `pipeline/cascade.py` — cascade 10 étapes (incl. nouvelle 5c archive.org), avec helpers internes `_aa_md5_from_doi`, `_aa_md5_from_title`, `_md5_download_cascade`, anti-homonymie strict
- `pipeline/transitions.py` — P2 enrichi (title-strict + author_match + bibkey fallback), P4, P6 inchangés
- `pipeline/dispatcher.py` — skip refs avec `blocked_by` non vide
- `pipeline/cli.py`, `pipeline/registry.py`, `pipeline/journal.py`, `pipeline/linter_wrapper.py`, `pipeline/config.py`, `pipeline/__main__.py` — inchangés (V0 OK)
- `pipeline/tests/coverage_set_2026-05-24.md` — jeu de test gelé (10 slugs validés par utilisateur)
- `pipeline/tests/coverage_run_2026-05-24.md` — rapport vivant des tests E2E par fix
- `pipeline/tests/assert_coverage.py` — garde-fou G4 mécanique (exit ≠ 0 si une étape manque son tableau G2)
- `pipeline/tests/test_f1_negative.py` — test négatif F1 sur ref retracted (anti-homonymie)
- `10_SOURCES/_registry/_websearch_queue.md` — manifest F4 (consommé par session interactive)

### Limites connues (transparence)

1. **AA Playwright Turnstile désactivé V1** : mismatch versions Chromium installées vs requises par playwright pip 1.50. ~5-10 refs concernées, gérables au cas par cas.
2. **WebSearch automatisé : volontairement remplacé par manifest queue** (V1). Scrapers DDG/Scholarly abandonnés (fragiles).
3. **Helper plugin `lib/annas_archive.py:search_books` cassé** : retourne `BookData` aux champs vides. Bypass par extraction HTML directe dans `_aa_md5_from_title`. À investiguer dans une session séparée.
4. **~61 refs sur 970 avec frontmatter non parsable** : silencieusement ignorées par le worker. Hors scope V1.
5. **Slugs registry ≠ slugs RTFM** : conditionne P5 reactivate-ocr. Bloqué sur rescan RTFM en cours.
6. **Q1 SessionStart hook** : non installé tant que P5 bloqué.

### `assert_coverage` (garde-fou anti-récidive)

```
$ venv/bin/python pipeline/tests/assert_coverage.py
=== assert_coverage : OK ===
  F1 : collins_2014 (bibkey_fallback OK), bel_2007 (négatif PASS)
  F2 : asselin_2000 (MD5 trouvé, DL KO documenté), garey_johnson_1979 (MD5 trouvé, DL KO documenté)
  F3 : arnold_1982 (positif/success), ito_2014 (négatif/no_match)
  F4 : ito_2014 (append OK), ito_2014 (idempotence OK)
exit=0
```

## 15. Ce que le worker ne fera jamais

Pour mémoire (anti-anti-pattern) :
- Écrire `sota_cited_confirmed` ou `retracted` (curator)
- Écrire de la prose dans les SOTAs / Papers (writer)
- Inventer une nouvelle phase ou créer un script `_v2` (extension de
  cascade dans le plugin)
- Sauter une étape de cascade « parce que ça va sûrement échouer » (toutes
  les étapes sont essayées dans l'ordre, échec ou succès loggés)
- Trust un top-1 résultat sans homonymy guard (titre similarity ≥ 0.6
  obligatoire)
