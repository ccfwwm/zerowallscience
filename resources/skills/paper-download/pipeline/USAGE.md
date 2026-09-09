# USAGE — Worker B au quotidien

Doc courte d'usage. Pour l'architecture : voir `plans/B_worker_FSM_pipeline.md`
et `plans/plan-design.md`. Toutes les commandes ci-dessous se lancent depuis
la racine du repo avec le venv activé :

```bash
source venv/bin/activate
python -m pipeline <sous-commande> [options]
```

Six sous-commandes : `status`, `run`, `lint`, `reactivate-ocr`, `doctor`,
`events`.

## Démarrage de session typique

```bash
python -m pipeline status                          # 1. comptes par état
python -m pipeline reactivate-ocr                  # 2. consomme les OCR finis
python -m pipeline run                             # 3. pousse les refs actives
python -m pipeline events --since 2026-05-24      # 4. récap pour le curator
```

`status` et `lint` sont read-only (pas de lock posé). `run` et
`reactivate-ocr` prennent un lock fichier (`_registry/_worker.lock`,
WorkerLock) : si une autre session tourne déjà, le démarrage échoue avec
`another pipeline session running (PID=…, started …)` et exit ≠ 0.

## `pipeline run` — filtres utiles

```bash
python -m pipeline run --state uid_resolved --limit 50    # batch ciblé sur un état
python -m pipeline run --ref arnold_1982_mathematical_model_shruti -v  # debug une ref
python -m pipeline run --cited-in SOTA_Bernard_Bel_Temperaments        # focus SOTA
python -m pipeline run --dry-run                          # plans sans muter
python -m pipeline run --no-lint                          # skip le lint final R1-R10
python -m pipeline run --no-doctor                        # skip les invariants I1-I15 finaux
```

`--cited-in` est répétable (OR sur les SOTAs/Papers cibles). `--limit 0`
(défaut) = pas de limite.

## Lecture du récap de `run`

À la fin de chaque session, une ligne du type :

```
Récap session : planned=X  done=Y  pending=Z  blocked=W  skipped_terminal=V
```

Par ref affichée pendant le run :

- `[done] <slug>     <from_state> → <to_state>`  transition réussie
- `[plan] <slug>     <state> → <fn_name>  # <reason>`  en mode `--dry-run`
- `[pending] <slug>  …`  transition non encore implémentée (NotImplementedYet)
- `[CRASH] <slug>: <ExceptionType>: <msg>`  exception non rattrapée (stack dans le journal)
- `[ILLEGAL] <slug>: …`  dispatcher refuse — état invalide

Suivi de :
1. `# Lint final` — invariants registry R1-R10 (sauf `--no-lint`)
2. `# Doctor final (invariants I1-I15)` — sur-couche worker (sauf `--no-doctor`)

L'exit code est `max(rc_lint, rc_doctor)`.

## `pipeline reactivate-ocr`

Boucle dédiée aux refs en `awaiting_rtfm_ocr`. Pour chaque ref : appelle
`rtfm check --path <pdf>`, dispatch selon le verdict
(`ok | still_pending | missing | anomaly | ocr_failed`), mute le frontmatter
si transition.

```bash
python -m pipeline reactivate-ocr           # verbose par défaut
python -m pipeline reactivate-ocr --quiet   # juste le récap final
```

## `pipeline lint` (R1-R10)

Wrapper du linter de registre (extérieur au worker). Couvre les invariants
R1-R10 (cohérence YAML, slugs, uid). Orthogonal à `doctor` (I1-I15).

## `pipeline doctor` (I1-I15)

Sur-couche worker : 15 invariants côté FSM + filesystem + cross-références SOTAs.
Détails dans `plans/plan-design.md` §1.

```bash
python -m pipeline doctor                       # check, exit ≠ 0 si ERROR
python -m pipeline doctor --fix                 # check + auto-fix (I4, I6, I9, I5 semi)
python -m pipeline doctor --severity warn       # filtre min : info | warn | error
python -m pipeline doctor --json                # sortie machine-readable
```

`--fix` n'est jamais déclenché automatiquement (anti-surprise). Les ERROR
(I5, I10, …) ne sont jamais auto-fixées : décision humaine requise.

Sévérités :
- ERROR (exit ≠ 0) : I1, I2, I3, I5, I6, I7, I8, I10, I14
- WARN (exit 0 + rapport) : I4, I9, I11, I12, I13
- INFO : I15

## `pipeline events` (journal JSONL filtré)

Lit `_registry/_journal/*.jsonl` (append-only) et filtre. Permet à la skill
`sota-curator` (hors worker) de savoir quelles refs ont bougé.

```bash
python -m pipeline events                                  # 24h glissantes
python -m pipeline events --since 2026-05-24               # date ISO (UTC, inclusif)
python -m pipeline events --to page1_validated             # filtre par état cible
python -m pipeline events --cited-in SOTA_Bernard_Bel_X    # intersection cited_in
python -m pipeline events --json                           # parseable jq
```

Combinaisons libres : `--since … --to … --cited-in … --json`.
La sortie texte récap liste les SOTAs candidats à mettre à jour.

## Quand intervenir manuellement

- `blocked_human:*` : ouvrir le YAML, lire `blocked_reason`, décider (curator).
- WebSearch queue : `_registry/_websearch_queue.md` (mode interactif Claude Code).
- Playwright manual queue : ~5-10 refs AA-only, à traiter au cas par cas.
- `doctor` signale I10 (`blocked_reason` vide) : passe manuelle exigée.
- `doctor` signale I5 (PDF manquant sur disque) : `--fix` bascule en
  `needs_reacquisition` semi-automatique, la prochaine `run` relance la cascade.

## Lever un `blocked_by`

1. Éditer le YAML : `blocked_by: ""` (ou supprimer le champ).
2. Relancer ciblé : `python -m pipeline run --ref <slug>`.

## `doctor --fix` : quand ?

- Jamais en automatique en fin de `run` (anti-surprise).
- Après lecture du rapport `doctor` : `python -m pipeline doctor --fix --severity warn`
  pour résorber les drifts mineurs (I4 path préfixé, I6 sha manquant, I9 numérotation
  attempts, I5 PDF manquant en semi).
- Les ERROR restent à arbitrer manuellement.

## Concurrence

Une seule session `run` ou `reactivate-ocr` à la fois (WorkerLock fcntl).
La deuxième sort immédiatement avec `LockBusyError`. Les sessions read-only
(`status`, `lint`, `doctor`, `events`) ne posent pas de lock.

Si un crash brutal a laissé un `.lock` zombie, la session suivante détecte
le PID mort (`os.kill(pid, 0)`) et nettoie automatiquement avant retry.

## Benchmark observé

~5-15 refs/min en charge typique (rate-limit Anna's Archive + Internet
Archive). Donc `pipeline run --limit 200` ≈ 15-45 min. Si l'utilisateur
observe < 5/min pendant 5 min consécutives, lancer `pipeline doctor` pour
voir les sources qui rentrent en circuit-breaker (5 fails consécutifs en
60s, par source, en mémoire — reset à chaque nouvelle session).

## Avant un batch important

Le registre est git-versioned dans `/mnt/d/.../10_SOURCES/_registry/.git/`.
Avant un gros `run`, vérifier que rien n'est dirty :

```bash
cd /mnt/d/.../10_SOURCES/_registry && git status
git add -A && git commit -m "checkpoint pre-run"
```

Le worker n'introduit pas de snapshot automatique : rollback = `git reset` côté
registre.

## Note — pre-commit hook côté registry git (hors worker)

Recommandation `plan-design.md` §7 T1 : ajouter un hook
`_registry/.git/hooks/pre-commit` qui lance `python -m pipeline doctor
--severity error` avant chaque commit registre. Hors scope worker
(le hook vit dans le repo registre), mentionné ici pour mémoire.

## Tests embarqués

```bash
python pipeline/tests/test_invariants_synthetic.py   # 15/15 fixtures I1-I15
python pipeline/tests/test_events.py                 # 7/7 filtres events
python pipeline/tests/test_idempotence.py            # 2ᵉ run = 0 transitions
python pipeline/tests/test_concurrent.py             # 1 exit 0, 1 LockBusy
python pipeline/tests/test_f1_negative.py            # anti-homonymie F1
python pipeline/tests/assert_coverage.py             # garde-fou couverture
```
