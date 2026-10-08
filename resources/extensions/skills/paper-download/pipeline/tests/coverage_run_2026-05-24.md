# Coverage run — Worker B fixes (2026-05-24)

Fichier vivant. Mis à jour à chaque fix avec preuves E2E.
Référence du jeu de test : `coverage_set_2026-05-24.md` (10 slugs gelés).

---

## F3 — `try_archive_org` (étape 5c cascade)

**Statut** : ✅ E2E validé sur 2 refs (1 positif + 1 négatif documenté).

### Test positif — arnold_1982_mathematical_model_shruti (slug #7)

| Phase | Verdict | Détails |
|---|---|---|
| try_archive_org standalone | `success` | identifier=`dli.ministry.16926`, pdf=`JSNA%2867%2929-41.pdf` (5341 KB) |
| _save_and_validate | `success` | `11_Biblio_MIR/Sources/Arnold_1982_A_Mathematical_Model_of_the_Shruti-Swara-Grama-Mur.pdf`, sha256=`9245ec6c24e0...` |
| probe_pdf_health | `ok_has_text` | 2245 chars/page sur 8p, 15p total |
| validate_pdf_against_ref | `True` | `validated [on_domain=7 off=0]` |
| Worker pdf_acquired_dispatch (P4) | `True` | `pdf_acquired → page1_validated via probe_ok_validate_passed` |
| **État final registry** | **`page1_validated`** | uid=`url:https://archive.org/details/dli.ministry.16926` |

### Test négatif — ito_2014_untitled (slug #9)

Livre Springer "Inverse Problems: Tikhonov Theory and Algorithms" — pas sur Internet Archive.

| Phase | Verdict | Détails |
|---|---|---|
| try_archive_org | `no_source` | `ia_no_match_above_threshold`, 5 candidats trouvés via fallback "Ito 2014" mais aucun ne passe le filtre titre ≥ 0.5 + score ≥ 4 |
| Queries tentées | 3 | full title (0 hits), keywords only (0 hits), author+year (5 hits → tous rejetés par best_search_match) |

→ Garde-fou anti-homonymie de `best_search_match` fonctionne : la query large "Ito 2014" retourne 5 résultats, aucun n'est attribué.

### Détails techniques utiles à mémoriser

**Bug encoding IA résolu** : le helper `archive_org_helper.download_public_pdf` ne quote pas les `%` littéraux dans les noms de fichiers IA (ex: `JSNA%2867%2929-41.pdf` contient `%28` `%29` comme caractères du nom). Le wrapper fait `quote(pdf_name, safe='')` avant de construire l'URL. Sinon HTTP 404.

**Stratégie 3-queries** : le helper IA full-text indexing est strict — il ne match pas "Shruti" vs "Shuruti" (transcription variante). Le wrapper enchaîne titre complet → keywords distinctifs → auteur+année (avec `best_search_match` qui filtre les faux positifs en aval).

### Limites identifiées (hors scope F3)

- **Intégration P2** : pour qu'une ref candidate sans DOI passe automatiquement par F3 via `pipeline run`, P2 doit attribuer un uid de fallback (`bibkey:` ou `url:`) quand Crossref/S2 ne donnent rien. Sinon `candidate → uid_resolved` échoue et la cascade ne se déclenche jamais. arnold_1982 a été mis manuellement en `uid:url:...` pour ce test. **À adresser dans un fix séparé ou en extension F1.**
- F3 nécessite un `title` non vide dans la ref. Refs avec `title: null` ou `title: untitled` sortent `no_source` sans tenter.

---

## F1 — Crossref title-fallback strict + bibkey fallback (P2 enrichi)

**Statut** : ✅ E2E validé sur 2 refs (1 fonctionnel + 1 négatif anti-homonymie).

**Modification scope** : P2 (`transitions.candidate_to_uid_resolved`) plutôt que `cascade.try_crossref_oa` comme le plan initial. Raison : la cascade ne reçoit jamais les refs sans DOI tant que P2 ne les a pas migrées de candidate → uid_resolved. Modifier `try_crossref_oa` seul aurait été inopérant.

**Améliorations apportées** :
- Seuil renforcé : `title_similarity ≥ 0.7` (vs 0.6 en V0)
- Filtre auteur strict via `s2_resolver.author_match`
- Tolérance année ±1 an (vs strict exact)
- Log explicite des candidats rejetés dans `acquisition_attempts[]` (G5)
- **bibkey fallback** : si aucun match strict, attribue `bibkey:auteurAnnéeMot` au lieu de `blocked_by` → la cascade peut tenter F2/F3 ensuite

### Test positif/fonctionnel — collins_2014_biblio_informatique (slug #8)

| Phase | Verdict | Détails |
|---|---|---|
| Crossref title-search | 3 candidats retournés | Live Coding of Consequence (Collins 2011), Live coding teaching SuperCollider (Collins 2016), Live coding laptop performance (Collins 2003) |
| `_pick_crossref_strict` | tous rejetés | sim ∈ {0.542, 0.507, 0.545}, tous < 0.7 |
| S2 fallback | rate-limit 429 | sleep 5s puis pas de match strict |
| Bibkey fallback déclenché | ✓ | uid attribué : `bibkey:collins2014algorave` |
| **État final** | **`uid_resolved`** | cascade peut maintenant tenter F2/F3 sur cette ref |

→ Comportement attendu : le vrai DOI "Algorave" de Collins (papier ICLC 2014, pas indexé Crossref) n'existe pas. Le seuil 0.7 a correctement filtré les papiers similaires-mais-distincts. Bibkey fallback débloque la suite.

### Test négatif — bel_2007_biblio_informatique (slug #10, retracted homonymie)

Script dédié : `pipeline/tests/test_f1_negative.py` (bypass dispatcher car
state=retracted). Le titre du registry est `'11_Biblio_Informatique/Sources/'`
(path parasite — c'est *exactement* le cas où l'ancien matching laxiste
aurait fabriqué un faux DOI).

| Phase | Verdict | Détails |
|---|---|---|
| Crossref title-search | 3 candidats retournés | "Informatique et droit comparé" (1970), "Solutions statiques Schwarzschild" (1971), "Accidental open emerging data sources" (2014) |
| `_pick_crossref_strict` | tous rejetés | sim ∈ {0.542, 0.217, 0.259}, tous < 0.7 ; year_diff ∈ {37, 36, 7} > 1 |
| Test result | **PASS** | aucun DOI attribué → bug P9α v1 non réintroduit |

```
$ venv/bin/python pipeline/tests/test_f1_negative.py
[PASS] F1 a rejeté tous les candidats Crossref (3 rejets) :
  - 10.3406/ridc.1970.15700: sim=0.542, raison=title_sim=0.542<0.7 ; year_diff=37>1
  - 10.1007/bf00759216: sim=0.217, raison=title_sim=0.217<0.7 ; year_diff=36>1
  - 10.1016/j.apgeog.2013.09.012: sim=0.259, raison=title_sim=0.259<0.7 ; year_diff=7>1
→ La ref retracted ne se voit pas réattribuer un DOI. F1 anti-homonymie OK.
```

### Critère G2 F1

```
F1 — testé E2E sur : [collins_2014 (bibkey_fallback OK), bel_2007 (négatif PASS)]
F1 — code écrit non testé E2E : (aucun)
```


---

## F2 — AA title-fallback (étape 7 cascade enrichie)

**Statut** : ✅ extraction MD5 par title-search E2E validée sur 2 refs. ⚠️ DL libgen/library.lol échoue sur les 2 refs testées (sources AA-only nécessitant Playwright/Turnstile, désactivé V1).

**Modification scope** : `cascade.py:try_annas_archive` refactoré avec 3 helpers internes (`_aa_md5_from_doi`, `_aa_md5_from_title`, `_md5_download_cascade`).

**Bug helper plugin détecté** : `lib/annas_archive.AnnasArchive.search_books` retourne actuellement des `BookData` aux champs vides (`url=None`, `mirror=None`, `format=None`, `description=None`). Parser BeautifulSoup cassé ou structure HTML AA modifiée. **À investiguer dans une session séparée** ; pour ne pas bloquer F2, le wrapper fait sa propre extraction depuis `https://annas-archive.gl/search?q=...` via regex split.

**Algorithme** :
1. `re.split(r'/md5/([0-9a-f]{32})', html)` → liste alternée `[head, md5_1, chunk_1, md5_2, chunk_2, …]`
2. Pour chaque chunk : strip HTML tags → texte plain
3. Filtre anti-homonymie : ≥ 1 mot distinctif (≥ 5 lettres) du titre + nom auteur normalisé dans le texte
4. 1ᵉʳ hit qui passe → MD5 retenu

### Test asselin_2000_musique_temperament (slug #6)

| Phase | Verdict | Détails |
|---|---|---|
| `_aa_md5_from_title` | md5 trouvé | `4df2b573fef584db185df1454a4e7bc2`, match keyword='musique' |
| `_md5_download_cascade` | `failed` | `aa_md5_found_but_no_dl` — libgen.li : pas de get.php?key= dans landing ; library.lol : 404 |
| Hypothèse | source AA-only | nécessite Playwright `/slow_download` (sous-fix abandonné en V1 — voir notes) |

### Test garey_johnson_1979_intractability (slug #5, livre ISBN)

| Phase | Verdict | Détails |
|---|---|---|
| `_aa_md5_from_title` | md5 trouvé | `84ff370115d39e89022f3f831a5e8d47`, match keyword='computers' |
| `_md5_download_cascade` | `failed` | idem — sources libgen/library.lol non disponibles pour ce MD5 |

→ Note : garey_johnson_1979 est **déjà en `sota_cited_confirmed`** (PDF déjà acquis ailleurs). Le test démontre que F2 trouve un MD5 plausible mais le DL automatique non-Playwright échoue.

### Sous-fix Playwright (G1 30 min timer — abandonné V1)

Tentative : `pip install playwright` → OK, mais `playwright.sync_api.sync_playwright().chromium.launch()` → `Error: Executable doesn't exist at chrome-headless-shell-linux64/chrome-headless-shell`. Mismatch versions browsers : pip a installé Playwright 1.50 qui demande Chromium 1223, alors que `~/.cache/ms-playwright/` contient 1200 et 1217. `playwright install chromium` aurait DL 5+ min → **abandon** (G1 30 min timer).

**Conséquence** : refs AA-only restent en queue manuelle (~5-10 refs concernées historiquement, gérables au cas par cas).

### Critère G2 F2

```
F2 — testé E2E sur : [asselin_2000 (MD5 trouvé, DL KO documenté),
                       garey_johnson_1979 (MD5 trouvé, DL KO documenté)]
F2 — code écrit non testé E2E : Playwright sous-fix (mismatch versions, abandonné V1)
```

---

## F4 — WebSearch manifest queue

**Statut** : ✅ E2E validé sur 1 ref + test idempotence.

**Comportement** : append `| slug | query | created_at | status: pending |` au fichier `10_SOURCES/_registry/_websearch_queue.md`. Crée le fichier avec header si absent. Détecte les refs déjà queued (idempotence).

### Test ito_2014_untitled (slug #9)

| Phase | Verdict | Détails |
|---|---|---|
| 1ᵉʳ appel | `no_source` (queued) | Ligne ajoutée : `"Inverse Problems: Tikhonov Theory and Algorithms" "Ito" filetype:pdf` |
| 2ᵉ appel (idempotence) | `no_source` (already_queued) | Ligne **non doublée** |
| Manifest créé | ✓ | header + format table markdown, 1 ligne ajoutée |

### Critère G2 F4

```
F4 — testé E2E sur : [ito_2014 (append OK), ito_2014 (idempotence OK)]
F4 — code écrit non testé E2E : (aucun)
```


---

## F4 — WebSearch = manifest queue (étape 8 cascade)

**Statut** : 🚧 à attaquer.

---

---

## P5 — `reactivate-ocr` via `rtfm check --path` (2026-05-24, post-rescan RTFM)

**Statut** : ✅ E2E validé sur 13 refs réelles `awaiting_rtfm_ocr` (verdicts mixtes documentés).

**Modifications** :
- Nouveau module `pipeline/rtfm_helper.py` : wrapper subprocess + status normalisé.
- Nouvelle transition `awaiting_rtfm_ocr_dispatch` dans `transitions.py`.
- `cli.py:cmd_reactivate_ocr` re-implémenté (était un stub).
- Le helper `rtfm_check_path` accepte exit code 2 (= "no match" valide) en plus de 0.
- Distinguo `still_pending` (fichier sur disque + matches=0 → RTFM pas encore scanné) vs `missing_in_index` (fichier absent → anomalie R8).

### Run sur 13 refs `awaiting_rtfm_ocr`

```
$ venv/bin/python -m pipeline reactivate-ocr

[wait] chomsky_1957_syntactic_structures      rtfm_still_pending
[wait] collins_2003_langages_musicaux         rtfm_still_pending
[wait] degano_1988_untitled                   rtfm_still_pending
[wait] jackendoff_1983_untitled               rtfm_still_pending
[wait] jakobson_1960_linguistics_poetics      rtfm_still_pending
[wait] kleene_1956_biblio_maths               rtfm_still_pending
[wait] lerdahl_2001_biblio_mir                rtfm_missing_in_index  ← anomalie R8
[wait] ludovico_2019_untitled                 rtfm_still_pending
[wait] mani_2005_biblio_maths                 rtfm_still_pending
[wait] mosses_1982_biblio_maths               rtfm_still_pending
[wait] polak_2014_biblio_ethno                rtfm_missing_in_index  ← anomalie R8
[wait] sambamoorthy_1957_untitled             rtfm_still_pending
[wait] weir_1988_untitled                     rtfm_still_pending

# reactivate-ocr — 13 refs en awaiting_rtfm_ocr scannées
  converted                    0
  still_pending               11
  missing_in_index             2
  anomaly                      0
  ocr_failed                   0
  needs_reacq_post_ocr         0
  error                        0
```

### Test du verdict "ok" via helper unit

aaron_2013 (state `sota_cited_confirmed`, déjà acquis, indexé RTFM) :
- `rtfm_status_for_ref('11_Biblio_Informatique/Sources/Aaron_2013_From_Sonic_Pi_to_Overtone.pdf')` → verdict `ok`, chunks=37, embeddings=37

### Anomalies R8 détectées (bonus de P5)

2 refs ont un `pdf_path` doublement préfixé :
- `lerdahl_2001_biblio_mir` : `pdf_path: 10_SOURCES/11_Biblio_MIR/Sources/Lerdahl_2001_Tonal_Pitch_Space_book.pdf` → résout à `.../10_SOURCES/10_SOURCES/...` (n'existe pas)
- `polak_2014_biblio_ethno` : `pdf_path: 10_SOURCES/12_Biblio_Ethno/Sources/Polak_2014_Timing_and_Meter_in_Mande_Drumming.pdf` (même bug)

À corriger manuellement (retirer le préfixe `10_SOURCES/`) ou via un fix R8 séparé.

### Critère G2 P5

```
P5 — testé E2E sur : [chomsky_1957 (still_pending OK), lerdahl_2001 (missing_in_index R8 detected),
                      aaron_2013 (ok via helper unit, chunks=37)]
P5 — code écrit non testé E2E sur refs réelles : ocr_failed (pas de cas dans les 13 actuels),
                      anomaly_zero_chunks (idem), needs_reacq_post_ocr (idem).
                      Ces branches sont vérifiées par lecture du code (chemins explicites,
                      verdicts attribués correctement).
```

---

## Tableau G2 global après tous les fixes

```
F1 — testé E2E sur : [collins_2014 (bibkey_fallback OK), bel_2007 (négatif PASS)]
F1 — code écrit non testé E2E : (aucun)
F2 — testé E2E sur : [asselin_2000 (MD5 trouvé, DL KO doc), garey_johnson_1979 (MD5 trouvé, DL KO doc)]
F2 — code écrit non testé E2E : Playwright sous-fix (mismatch versions, abandonné V1)
F3 — testé E2E sur : [arnold_1982 (positif/success), ito_2014 (négatif/no_match)]
F3 — code écrit non testé E2E : (aucun)
F4 — testé E2E sur : [ito_2014 (append OK), ito_2014 (idempotence OK)]
F4 — code écrit non testé E2E : (aucun)
P5 — testé E2E sur : [chomsky_1957 (still_pending), lerdahl_2001 (missing R8), aaron_2013 (ok unit)]
P5 — code écrit non testé E2E : ocr_failed, anomaly_zero_chunks, needs_reacq_post_ocr (branches sans cas dans les 13 actuels)
```

---

## Couche 1 — Invariants I1-I15 (2026-05-24)

**Statut** : ✅ 15/15 fixtures synthétiques OK.

**Implémentation** : `pipeline/invariants.py` (15 fonctions `check_I<n>`) +
`pipeline/doctor.py` (orchestrateur + auto_fix + rapport markdown/JSON) +
sous-commande CLI `pipeline doctor [--fix] [--severity] [--json]` +
intégration en fin de `pipeline run` (miroir `--no-doctor` du `--no-lint`).

**Tests** : `pipeline/tests/synthetic/refs/I<n>_*.md` (15 fixtures) + 1 SOTA
synthétique pour I12 + 1 PDF synthétique pour I5/I6/I7/I13/I15.
`pipeline/tests/test_invariants_synthetic.py` lance les 3 phases : détection,
auto-fix, anti-heuristique I10.

### Détail par invariant

```
I1  — testé synthétique sur : [I01_state_unknown (ERROR détecté)]
I1  — code écrit non testé E2E : exit code 0 sur registre réel à valider
I2  — testé synthétique sur : [I02a+I02b paire avec slug forcé en mémoire (ERROR détecté)]
I2  — code écrit non testé E2E : doublon natif sur disque impossible (fs nature), simulation mémoire est l'unique mode
I3  — testé synthétique sur : [I03_uid_bad_prefix (préfixe foobarprefix:, ERROR détecté)]
I3  — code écrit non testé E2E : uid non-string (type incorrect)
I4  — testé synthétique sur : [I04_pdf_path_prefixed (préfixe 10_SOURCES/, WARN détecté, auto-fix R8 OK)]
I4  — code écrit non testé E2E : pdf_path absolu (chemin commençant par '/') — détection codée, fixture absente
I5  — testé synthétique sur : [I05_pdf_missing (pdf_path inexistant, ERROR détecté, auto-fix semi OK)]
I5  — code écrit non testé E2E : pdf_path absent dans state pdf_acquired (branch return early codée, fixture absente)
I6  — testé synthétique sur : [I06_sha256_invalid (sha non hex, ERROR détecté, auto-fix recompute OK)]
I6  — code écrit non testé E2E : pdf_sha256 absent (branch codée), fix avec PDF inexistant (no-op codé)
I7  — testé synthétique sur : [I07_page1_log_inconsistent (verdict='failed_author_mismatch', ERROR détecté, auto-fix semi OK)]
I7  — code écrit non testé E2E : log absent, at non ISO (branches codées, fixtures absentes)
I8  — testé synthétique sur : [I08_history_non_monotonic (at descending, ERROR détecté)]
I8  — code écrit non testé E2E : last_state ≠ frontmatter.state (branch codée, fixture absente)
I9  — testé synthétique sur : [I09_attempts_renumber (n=1,3,4, WARN détecté, auto-fix renumber OK)]
I9  — code écrit non testé E2E : (aucun)
I10 — testé synthétique sur : [I10_blocked_no_reason (blocked_reason vide ET blocked_since absent, 2 ERROR détectés, auto_fixable=False vérifié)]
I10 — code écrit non testé E2E : (aucun) — l'invariant ne s'auto-fix JAMAIS par design
I11 — testé synthétique sur : [I11_cited_in_orphan (SOTA inexistant, WARN détecté)]
I11 — code écrit non testé E2E : cited_in malformé (non-list, non-dict) — branches codées, fixtures absentes
I12 — testé synthétique sur : [i12_reciprocity_missing + SOTA_Fixture_I12_Cites_It.md (WARN détecté)]
I12 — code écrit non testé E2E : wikilink vers ref absente du registre (skip codé, fixture absente)
I13 — testé synthétique sur : [I13a+I13b (même sha256 sur PDF synthétique, WARN détecté pour chaque slug impliqué)]
I13 — code écrit non testé E2E : (aucun)
I14 — testé synthétique sur : [I14_terminal_transition (retracted → uid_resolved dans history, ERROR détecté)]
I14 — code écrit non testé E2E : terminal sans suivant (no-op codé), pairs avec entries None (skip codé)
I15 — testé synthétique sur : [I15_rtfm_overdue (ocr depuis 480j, last_check 350j, INFO détecté)]
I15 — code écrit non testé E2E : ocr_pending_since absent (skip codé), seuils 30j/7j non testés en frontière
```

### Limites connues (transparence)

- I2 (slug doublon) : impossible à reproduire sur disque (fs ne le permet pas). Le test simule via patch en mémoire — adéquat pour valider la logique de détection, mais pas le scénario "vraie collision après rename foireux".
- I11/I12 : dépendent du layout `Publications/` + `Articles/`. Les fixtures pointent vers un vault synthétique sous `pipeline/tests/synthetic/vault/`. La résolution dans le vrai vault n'est testée que par lecture de code.
- I15 : la fenêtre 30j/7j est dure. Pas de test paramétrable des seuils (le now() est captured à l'appel).
- Auto-fix I5/I7 : "semi" — bascule en `needs_reacquisition` + flag. Le test vérifie que `auto_fix` retourne fixed > 0 mais ne re-check pas le state post-fix (puisque la fixture serait alors needs_reacquisition, plus en violation I5/I7). À valider sur registre réel avant usage production de `--fix` sur ces invariants.

---

## Couche 5 — Corrélation RTFM I16-I19 (2026-05-24)

**Statut** : ✅ 4/4 fixtures synthétiques OK avec mocks.

**Implémentation** :
- `pipeline/rtfm_failures.py` (~200 LOC) : wrapper `list_failures()`,
  `check_ref()`, `is_pdf_image_only()`, dataclass `RtfmFailure`.
- `pipeline/invariants.py` : `check_I16/17/18/19` + `REF_LEVEL_CHECKS_WITH_CTX`.
- `pipeline/doctor.py` : `run_all_checks(correlate_rtfm, check_sha, rtfm_failures_override)`.
- `pipeline/cli.py` : flags `--correlate-rtfm` et `--check-sha` sur `pipeline doctor`.

**Schéma observé `rtfm failed -f json`** (cf. rtfm/cli.py::cmd_failed) :
```json
{"total": int, "failures": [{"id", "type", "filepath", "corpus",
  "bucket", "error", "finished_at"}]}
```

**Buckets RTFM connus** (`_failure_bucket` in rtfm/cli.py:189) :
`pdf-format-invalid`, `file-vanished`, `duplicate-content`,
`memory-exceeded`, `pdftext-other`, `ocr-tesseract-error`, `other`, `unknown`.

**Tests** : `pipeline/tests/synthetic/refs/I1{6,7,8,9}_*.md` (4 fixtures) +
mocks de `rtfm_failures.list_failures` (via `rtfm_failures_override`) et
`is_pdf_image_only` (monkey-patch).

### Détail par invariant

```
I16 — testé synthétique sur : [I16_rtfm_ingest_failure (bucket=pdftext-other, WARN détecté, mock list_failures)]
I16 — code écrit non testé E2E : branche file-vanished+PDF-présent (ERROR drift cache) — codée, fixture absente ; appel rtfm CLI réel sur registre (rtfm DB courante est vide d'échecs au 2026-05-24)
I17 — testé synthétique sur : [I17_pdf_format_invalid (bucket=pdf-format-invalid, ERROR détecté, mock list_failures)]
I17 — code écrit non testé E2E : signal probe_pdf_health seul (sans RTFM) — code écrit, fixture absente (nécessite un PDF corrompu réel) ; signal croisé probe+RTFM (confiance haute) idem
I18 — testé synthétique sur : [I18_sha_drift (sha YAML=deadbeef… vs sha réel, ERROR détecté, check_sha=True)]
I18 — code écrit non testé E2E : branche pdf inexistant (skip), sha=None (skip lecture) — branches codées, fixtures absentes ; recompute sur registre réel à valider (909 PDFs, ~minutes)
I19 — testé synthétique sur : [I19_image_only_no_text_sources (mock is_pdf_image_only→True, INFO détecté, sources crossref/arxiv en no_source/skipped_breaker)]
I19 — code écrit non testé E2E : pdftext absent (détection None, skip) — codé, non testé ; image-only avec au moins 1 source texte vraiment tentée (return [] codé, fixture absente) ; case state ≠ {pdf_acquired,awaiting_rtfm_ocr} (skip codé)
```

### Décisions de design

- **Pré-chargement** : `list_failures()` appelé 1 seule fois par `run_all_checks(correlate_rtfm=True)`, partagé dans `ctx["rtfm_failures"]` (évite 909 appels CLI).
- **Mocking en tests** : `rtfm_failures_override` paramètre injectable dans `run_all_checks` (anti-monkey-patch à chaud, plus propre).
- **Anti-heuristique I18** : sha drift n'est jamais auto-fixé (on ne sait pas si YAML ou fichier est correct). Le flag `--check-sha` est SÉPARÉ de `--correlate-rtfm` car le coût (sha256 sur 909 fichiers) est différent du coût (1 appel `rtfm failed`).
- **Matching path** : `find_failure_for_path` tolérant — basename + chemin absolu (gère worktrees + symlinks).
- **`probe_pdf_health` absent** : si `validate_pdf_content` n'est pas importable (ex: hors worker), I17 fonctionne quand même en signal partiel RTFM-only.

### Limites connues

- RTFM DB locale au 2026-05-24 : 0 échecs (`rtfm failed -f json` → `{"total": 0, "failures": []}`). Le code Couche 5 n'a donc PAS été validé E2E sur registre réel avec failures réelles — uniquement via mocks. À valider dès qu'une session d'ingest produit des échecs.
- `is_pdf_image_only` dépend de `pdftotext` (poppler-utils). Sans, on retourne None et I19 ne lève jamais (skip safe).
- I19 sources texte : la liste `_TEXT_PDF_SOURCES` est gelée sur `cascade.CASCADE`. Si une nouvelle source est ajoutée à la cascade, il faut mettre à jour `_TEXT_PDF_SOURCES`.
- I18 reste opt-in (`--check-sha`) — sur registre réel de 909 PDFs sur HDD lent, c'est l'ordre de la minute. Pas adapté à un appel par défaut.


---

## Skills du plugin (S1-S6) — preuves de test

Section ajoutée 2026-05-25 lors de la phase P5 du plugin paper-trail.
Chaque skill du plugin doit avoir une preuve de test (E2E ou
structurelle) consignée ici avant chaque livraison.

```
S1 pdf-cascade — testé E2E sur : [arnold_1982_mathematical_model_shruti (dry-run plan affiché, sans mutation), test_skills_structure (frontmatter validé)]
S1 pdf-cascade — code écrit non testé E2E : cascade complète shadow opt-in en cours d'exécution (background, validation post-fin), validation page 1 sur PDF image-only (codé, fixture absente)

S2 registry-doctor — testé E2E sur : [registre réel 909 refs (rapport produit, 101 ERROR / 161 WARN signalés), 19 fixtures synthétiques (19/19 OK via test_invariants_synthetic.py)]
S2 registry-doctor — code écrit non testé E2E : --check-sha sur registre réel (recompute 909 sha256, ~minutes), --correlate-rtfm avec failures réelles (RTFM DB vide actuellement)

S3 sota-writer — testé E2E sur : [migration depuis musicology-phd (220 LOC, validation structurelle frontmatter via test_skills_structure)]
S3 sota-writer — code écrit non testé E2E : workflow 4 phases complet sur sujet réel (paper-search MCP + cascade + lecture + rédaction, à valider en session interactive avec plugin installé)

S4 sota-auditor — testé E2E sur : [migration depuis musicology-phd sota-curator (249 LOC, validation structurelle frontmatter)]
S4 sota-auditor — code écrit non testé E2E : --purge sur SOTA réel avec ref retracted (à valider une fois le drift résiduel investigué post-cascade)

S5 citation-receipts — testé E2E sur : [tools/citation_audit.py parsing LaTeX (test unit \cite{a},\cite{b} → 2 citations correctement parsées, voir transcript session 2026-05-25)]
S5 citation-receipts — code écrit non testé E2E : --warn mode (insertion \todo dans .bak), audit complet sur paper réel (.tex avec 20+ citations)

S6 paper-writer — testé E2E sur : [test_skills_structure (frontmatter + body validés), migration musicology-phd 67 LOC (diff vs source validé)]
S6 paper-writer — code écrit non testé E2E : workflow complet IMRaD sur sujet réel (Methods/Results/Discussion + Related Work depuis SOTAs audités, audit-article pré-soumission)
```

### Notes méthodologiques sur les S1-S6

- **S1, S2** : skills wrappers autour du worker Python — le worker B est testé à 19/19 invariants synthétiques + idempotence + concurrence + events. La validation E2E "dry-run" suffit pour le wrapper.
- **S3, S4, S6** : skills d'orchestration interactive (Claude Code skill). Le test E2E réel nécessite une session Claude Code avec le plugin installé sur un vrai sujet de recherche. À valider une fois v0.1 publiée localement.
- **S5** : skill avec outil Python sous-jacent (`citation_audit.py`). Le parsing LaTeX et le matching keywords sont testables sans Claude Code ; le format RECEIPTS.md et le mode `--warn` nécessitent un fichier source réel.
- Les skills migrées depuis musicology-phd (S3, S4, S5, S6) tournaient déjà en production interne sur le projet doctoral avant migration. La généralisation a retiré les chemins hardcodés et les exemples projet-spécifiques mais préservé la philosophie.
