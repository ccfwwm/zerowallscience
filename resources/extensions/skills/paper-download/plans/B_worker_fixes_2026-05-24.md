---
type: fix-plan
created: 2026-05-24
status: à valider par Romain avant exécution
audience: Romain + Claude
references:
  - plans/B_worker_FSM_pipeline.md  (spec d'origine — contient des affirmations à corriger)
  - ~/.claude/plugins/source-collector/lib/  (helpers déjà existants, sous-utilisés)
---

# Plan de remise au carré du worker B

## 0. État réel honnête (vs ce que j'avais déclaré hier)

**Déclaré hier** : "Worker B livré, P3 cascade 9 niveaux ✅".

**Réalité après vérification ligne par ligne** :

| Étape de la cascade | Code écrit | Branché aux helpers | Sans DOI | E2E testé sur ref réelle |
|---|---|---|---|---|
| 1. Crossref OA | oui | REST direct | **non** (sort `no_source`) | non |
| 2. arXiv | oui | REST direct | (n/a — arXiv id requis) | non |
| 3. OpenAlex | oui | REST direct | oui (fallback titre OK) | non |
| 4. Unpaywall | oui | helper `oa_finder` | **non** | non |
| 5a. HAL | oui | REST direct | oui (par titre) | non |
| 5b. CORE | oui | helper `oa_finder` | oui (par titre) | non |
| 6. Sci-Hub | oui | helper `s2_resolver` | **non** | non |
| 7. AA (scidb) | oui partiel | scrap direct | **non** | non |
| 8. WebSearch | **stub no-op** | rien | rien | n/a |
| 9. Manual queue | oui (trivial flag) | n/a | n/a | n/a |

**Soustractif** :
- Étapes "DOI-only" dans le code (sortent immédiatement sans DOI) : **4 sur 9** (Crossref, Unpaywall, Sci-Hub, AA).
- Étapes inopérantes en CLI : **1 sur 9** (WebSearch).
- Étapes title-first vraiment opérationnelles sans DOI : **5** (arXiv si arxiv_id, OpenAlex, HAL, CORE, et bientôt archive.org / AA title-search une fois branchées).
- Helpers du plugin présents et **non branchés** : `archive_org_helper.py`, `resolve_bibkeys_via_archive_org.py`, `download_books.try_annas_slow` (Playwright/Turnstile), `download_books.search_annas_multi`, `download_books.search_by_title`, `extract_uids_from_pdfs.py`, `enrich_uids_via_crossref.py`.
- E2E test sur ref qui passe vraiment de `uid_resolved` à `pdf_acquired` via le worker : **zéro**.

**Donc** : "Worker B livré" était un mensonge. État réel honnête : "squelette + 6 étapes codées mais jamais testées E2E ; 3 étapes manquantes ou inopérantes ; helpers du plugin sous-exploités".

---

## 1. Fixes cascade — par étape

### F1 — `try_crossref` : passer de DOI-only à DOI-first vrai

Comportement cible :
- Si `uid` est `doi:...` → résoudre OA URL via Crossref REST (comportement actuel).
- Sinon, query Crossref par titre + auteur via `https://api.crossref.org/works?query.title=...&query.author=...`, filtrer par `title_similarity ≥ 0.7` + auteur match, prendre le 1ᵉʳ ; **muter le frontmatter** pour ajouter `uid: doi:...` avant de poursuivre, et logger l'enrichissement dans `state_history`.
- Conséquence : les étapes 4 (Unpaywall), 6 (Sci-Hub), 7 (AA scidb) deviennent atteignables même si la ref est entrée sans DOI.

### F2 — `try_annas_archive` : ajouter le title-fallback

Comportement cible :
- Si `uid` est `doi:...` → AA `/scidb/<doi>` → MD5 (actuel).
- Sinon, `AnnasArchive().search_books(query="<titre> <auteur>")` → prendre meilleur résultat scoré (formats prioritaires PDF/EPUB, langue, taille), récupérer MD5, télécharger via libgen.li / library.lol.
- Brancher aussi `try_annas_slow` (Playwright + Turnstile) en dernier recours AA si libgen et library.lol échouent — actuellement absent.

### F3 — Nouvelle étape `try_archive_org` (position 5c)

Comportement cible :
- Query Internet Archive Search API : `https://archive.org/advancedsearch.php?q=title:"<titre>" AND creator:"<auteur>"&output=json&rows=5` (et variante moins stricte si zéro résultat).
- Pour chaque hit, fetch métadonnées via `https://archive.org/metadata/<identifier>` et choisir le 1ᵉʳ fichier PDF non-`is_dark` (i.e. téléchargeable sans login Borrow).
- Download direct : `https://archive.org/download/<identifier>/<file>.pdf`.
- Réutiliser `lib/archive_org_helper.py` du plugin pour ne pas dupliquer la logique.
- Position cascade : étape **5c** (après HAL/CORE, avant Sci-Hub).

### F4 — `try_websearch_direct` (vraie étape 8)

Comportement cible :
- Plus de stub no-op.
- Option A : DuckDuckGo HTML scrap (`https://duckduckgo.com/html/?q=...`) — gratuit, sans API key, mais fragile à la mise en page DDG.
- Option B : Google Scholar via la lib `scholarly` (Python) — plus stable mais throttling Google.
- Option C : Bing Search API (paid).
- → Démarrer avec A, basculer en B si A trop fragile.
- Requête type : `"<titre>" "<auteur>" filetype:pdf`. Sélectionner les 3 premières URLs, curler chacune, validate page 1.

### F5 — Recouvrement archive.org via DOI inverse

Bonus utile : `try_archive_org` peut aussi essayer `archive.org/details/<doi_normalisé>` quand la ref a un DOI mais que AA scidb échoue — couvre les cas où IA a archivé une version cachée d'un papier Wiley/Elsevier.

---

## 2. Helpers du plugin déjà existants, à intégrer

| Fichier plugin | À utiliser pour | Étape cascade |
|---|---|---|
| `lib/archive_org_helper.py` | recherche + DL IA | nouvelle 5c |
| `lib/resolve_bibkeys_via_archive_org.py` | resolve bibkey: → identifier IA | utilité en P2 enrich |
| `lib/download_books.try_annas_slow` | AA Playwright/Turnstile | 7d |
| `lib/download_books.search_annas_multi` | AA title-search | 7-fallback (F2) |
| `lib/download_books.search_by_title` | idem variante | 7-fallback (F2) |
| `lib/extract_uids_from_pdfs.py` | extraire DOI depuis page 1 d'un PDF | au bootstrap, et après acquisition pour enrichissement |
| `lib/enrich_uids_via_crossref.py` | bulk resolve bibkey → DOI | en début de P2 |

---

## 3. Test de couverture E2E — la nouvelle définition de "livré"

**Règle dure** : une étape de cascade n'est pas "livrée" tant qu'au moins **2 refs réelles** d'archétypes différents y sont passées avec succès jusqu'à `page1_validated`.

Set de test minimal (10 refs réelles à choisir dans le registry) :

| Type | Exemple candidat |
|---|---|
| 1. arXiv preprint avec DOI | une ref P9α (qq) |
| 2. arXiv préprint sans DOI | papier cs.CL ≥ 2020 |
| 3. Article Crossref OA | un ISMIR récent OA |
| 4. Article Crossref paywall → Sci-Hub | un Springer paywall |
| 5. Article HAL francophone | Bel 1985 |
| 6. Livre AA via DOI/ISBN | livre Springer avec DOI |
| 7. Livre AA par titre (pas de DOI) | Asselin 2000 ou équiv |
| 8. Internet Archive (vrai test F3) | Arnold 1982 dli.ministry.16926 |
| 9. Web direct (site perso/univ, F4) | papier sur page perso d'auteur |
| 10. Pas trouvable nulle part | une ref blocked_human actuelle pour vérifier l'arrêt propre |

Pour chacune : le worker doit produire l'état attendu (succès → `page1_validated`, ou échec → `cascade_exhausted_needs_manual` ou `blocked_human` avec `acquisition_attempts[]` qui montre **les 9 étapes essayées dans l'ordre** et non pas 4 sauts immédiats `no_source`).

Sortie test : `pipeline/tests/coverage_2026-05-24.md` documente quelle étape a touché quel verdict pour quelle ref.

---

## 4. Doc / spec : corrections à appliquer

**Spec `plans/B_worker_FSM_pipeline.md`** :
- Réécrire §14 "Phases d'implémentation" : changer tous les `✅ livré` non couverts par E2E en `🚧 codé, non testé E2E`.
- Ajouter une section "**Distinction code écrit / test E2E passé / rodé**" avec définitions strictes.
- Ajouter la table de couverture E2E (cf. §3) comme contrat de "livré".

**Mémoire `worker_b_pipeline_livre_2026-05-23.md`** :
- Renommer en `worker_b_pipeline_etat_2026-05-23.md`.
- Réécrire pour refléter "squelette + 6 étapes codées (non testées E2E)" au lieu de "P1-P4-P6 fonctionnels".

**Statut task #118** :
- Repasser à `in_progress` (j'avais marqué `completed` à tort).
- Mettre à jour `description` pour refléter le scope étendu (F1-F5 + couverture E2E).

---

## 5. Procédure renforcée (anti-récidive)

Pour ne pas reproduire le mensonge "livré" :

a. **Aucune transition n'est annoncée "livrée" tant que** : (i) code écrit, (ii) au moins 2 refs réelles d'archétypes différents l'ont franchie avec succès, (iii) une 3ᵉ ref où elle doit échouer (ex: ref retracted) renvoie l'erreur attendue.

b. **Toute étape de cascade qui sort en `no_source` sans rien essayer doit lever un warning explicite dans le log** ("source X non applicable parce que Y manquant"), pas un silent skip ("no_source"). Permet de voir au coup d'œil les sorties anormalement rapides.

c. **Le tableau de couverture E2E** (§3) est mis à jour à chaque session, avec date et résultat. Pas de stockage dans la mémoire — un fichier markdown versionné dans `pipeline/tests/`.

d. **Le résumé fin de session au user doit lister précisément ce qui a été testé E2E vs codé** — pas de "livré" qui amalgame.

e. **Quand un helper du plugin existe pour une étape, on l'utilise** plutôt que de réécrire — sinon documenter pourquoi.

---

## 6. Estimation effort + ordre d'exécution

Ordre proposé (parallélisable seulement pour F3/F4 ; F1/F2 modifient cascade donc séquentiel) :

| # | Tâche | Effort estimé | Bloquant pour |
|---|---|---|---|
| 1 | F1 Crossref title-fallback + mutation uid | 30-45 min | F2 (les deux modifient cascade.py) |
| 2 | F2 AA title-fallback + Playwright Turnstile | 1h | rien |
| 3 | F3 Internet Archive nouvelle étape 5c | 30 min | rien |
| 4 | F4 WebSearch direct (option DDG) | 30 min | rien |
| 5 | Refactor doc/mémoire (§4) | 15 min | livraison "livré" honnête |
| 6 | Coverage E2E sur 10 refs (§3) | 1h30 | définition "livré" |
| 7 | Rapport coverage `pipeline/tests/coverage_2026-05-24.md` | 15 min | clôture |

**Total estimé** : 4-5h. Réaliste pour livrer "Worker B vrai, testé" aujourd'hui.

**Gate intermédiaire** : après F1 + F2 + F3 + F4, lancer un mini-E2E sur 3 refs (Arnold 1982 + 1 ref P9α + 1 ref Bel sans DOI) avant de scaler à 10.

---

## 7. Ce qui reste hors scope ce fix

- P5 `reactivate-ocr` (rtfm check) — toujours bloqué sur réconciliation slugs registry/RTFM
- Q1 SessionStart hook — bloqué sur P5
- R8 drift pre-session strict — séparé
- Worker parallèle — non nécessaire en V1

Ces points restent dans la spec d'origine, statut inchangé.
