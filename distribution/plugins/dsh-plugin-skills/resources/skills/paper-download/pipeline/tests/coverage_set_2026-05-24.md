# Coverage set E2E — Worker B fixes (2026-05-24)

**Statut** : à valider par Romain avant tout fix de cascade (Phase 0 du plan
`/home/romi/.claude/plans/glittery-leaping-canyon.md`).

**Objectif** : 10 refs réelles, 1 archétype par ligne, couvrant tous les
chemins de la cascade. Chaque fix F1-F2-F3-F4 doit avoir au moins une ref
qui le déclenche avec verdict attendu (positif ou bloqué documenté).

## Jeu de test gelé

| # | Slug | Archétype | Verdict attendu | Fix testé |
|---|---|---|---|---|
| 1 | `aaron_2013_biblio_informatique` | DOI résolu, déjà acquis via scihub | no-op `already_tried` sur toutes les sources, dispatcher skip (state=`sota_cited_confirmed`) | régression non-régression |
| 2 | `chemillier_2003_computation_words` | uid: arxiv: | déjà acquis → no-op si `sota_cited_confirmed`, sinon arXiv direct doit retourner success | étape 2 arXiv |
| 3 | `aho_1968_biblio_maths` | DOI + scihub déjà loggé | `already_tried` skip étapes déjà loggées | régression cascade |
| 4 | `arnoldbel_1985_intonation_juste_inde` | HAL francophone, déjà acquis | `already_tried` ou état terminal | étape 5a HAL |
| 5 | `garey_johnson_1979_intractability` | uid: isbn:, livre académique | AA libgen/library.lol via ISBN search | étape 7 AA (DOI-only ou ISBN-fallback ?) |
| 6 | `asselin_2000_musique_temperament` | **Livre, sans DOI, sans ISBN résolu** | **F2 décisif** : AA `search_books` par titre+auteur → MD5 → libgen/library.lol → success | **F2 AA title-search** |
| 7 | `arnold_1982_mathematical_model_shruti` | **Pas de DOI, sur archive.org** (dli.ministry.16926) | **F3 décisif** : `try_archive_org` → success via IA Search API | **F3 archive.org** |
| 8 | `collins_2014_biblio_informatique` | **Sans DOI, titre clair "Algorave: Live Coding for Dancing"** | **F1 décisif** : Crossref title-search → DOI muté → cascade DOI complète → success | **F1 Crossref title-fallback** |
| 9 | `ito_2014_untitled` | "Inverse Problems: Tikhonov" — pas trouvable nulle part | cascade épuisée propre → `cascade_exhausted_needs_manual` (PAS de crash, PAS de blocage muet) | étape 9 manual + F4 manifest |
| 10 | `bel_2007_biblio_informatique` | **retracted homonymie** | **F1 test NÉGATIF** : doit retourner `no_match_above_threshold`, pas attribuer d'UID. Si F1 attribue un UID à cette ref retracted, F1 est cassé et doit être désactivé. | **F1 garde-fou anti-homonymie** |

## Couverture par fix

| Fix | Refs cibles | Type de test |
|---|---|---|
| F1 Crossref title-fallback | #8 collins_2014, #10 bel_2007 | positif + négatif |
| F2 AA title-search | #6 asselin_2000 | positif |
| F3 archive.org | #7 arnold_1982 | positif |
| F4 WebSearch manifest | #9 ito_2014 | append manifest |
| Régression / no-op | #1, #2, #3, #4 | `already_tried` doit fonctionner |
| Cascade épuisée propre | #9, et #6/#7 si fixes échouent | `blocked_by: cascade_exhausted_needs_manual` documenté |

## Validation user

Le user doit signaler tout slug mal choisi (ref déjà retraitée, état
incohérent) avant que Phase 1 ne démarre. Modifications par message
explicite ou par édition directe de ce fichier.

**Critère de sortie Phase 0** : ce fichier est validé tel quel (ou amendé)
par Romain.

## Pré-vérification (déjà faite côté Claude)

- Les 10 slugs existent dans `10_SOURCES/_registry/refs/`.
- Les états ont été lus :
  - aaron_2013 : `sota_cited_confirmed`, uid: doi:10.1145/2505341.2505346
  - chemillier_2003 : uid: arxiv:... (state à confirmer au run)
  - aho_1968 : `sota_cited_confirmed`, scihub validated
  - arnoldbel_1985 : déjà acquis via HAL le 2026-05-18
  - garey_johnson_1979 : uid: isbn:..., `sota_cited_confirmed`
  - asselin_2000 : créé par sota-writer hier soir, `candidate` + `blocked_human` ?
  - arnold_1982 : créé par sota-writer hier soir, `candidate`
  - collins_2014 : `candidate` avec `blocked_by: title_mismatch_no_uid_found` (du run hier soir)
  - ito_2014 : `candidate` avec `blocked_by: title_mismatch_no_uid_found`
  - bel_2007 : `retracted`, raison `homonymie`
