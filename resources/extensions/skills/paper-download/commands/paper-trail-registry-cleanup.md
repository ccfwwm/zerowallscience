---
description: Nettoyage historique du registre des fiches bibliographiques (les ~900 fiches existantes). Cible les vieilles fiches mal nommées (`*_0000_*`, `_untitled`) ET les duplicates avec suffixes numériques (`foo_2020_bar_2`, `_2_3_4`) qui sont des artefacts de runs INGEST passés. Délègue les décisions au sub-agent `textbook-resolver`. Les merge sont propagés automatiquement vers tous les SOTAs via `sota_sync`.
---

# `/paper-trail:registry-cleanup` — Nettoyage historique du registre

Distinct de `resolve-textbooks` (qui est session-locale, ne traite que les
refs textbook ingérées sans year/title) : `registry-cleanup` est **global**,
scanne tout le registre et inclut aussi les duplicates avec suffixes
numériques moches.

## Usage

```
/paper-trail:registry-cleanup                  # dry-run (montre les décisions)
/paper-trail:registry-cleanup --apply          # applique
```

## Ce que fait Claude

1. **Liste les candidates** :
   ```bash
   python3 -m pipeline registry-cleanup --list > /tmp/registry_cleanup_candidates.json
   ```
   Inclut :
   - Refs `*_0000_*` ou `_untitled` (placeholders INGEST)
   - Refs avec year vide/`0000`/`nd`/`None`
   - Refs avec title vide
   - **Refs avec suffixe numérique** (`_2`, `_2_3`, `_2_3_4`, etc.) —
     artefacts des runs précédents

2. **Invoque le sub-agent `textbook-resolver`** avec le JSON :
   ```
   Agent(subagent_type="paper-trail:textbook-resolver",
         prompt=<contenu /tmp/registry_cleanup_candidates.json>)
   ```
   Le sub-agent applique ses règles : `merge_into` si sibling complet,
   `complete` si textbook canonique reconnu, `blocked` sinon.

3. **Sauve le JSON de décisions** dans
   `/tmp/registry_cleanup_decisions.json`.

4. **Mode dry-run** (défaut) : affiche les décisions par catégorie,
   demande confirmation avant `--apply`.

5. **Mode `--apply`** :
   ```bash
   python3 -m pipeline registry-cleanup \
       --apply-from /tmp/registry_cleanup_decisions.json
   ```
   Les `merge_into` déclenchent automatiquement `sota_sync` (les
   wikilinks dans tous les SOTAs concernés sont mis à jour).

6. **Récap final** : N merged + sync, N completed, N blocked.

## Quand l'utiliser

- **Après migration vers v0.2.0+** : rattrape les vieux duplicates
- **Tous les 3-6 mois** : hygiène registre (au fur et à mesure que le
  registre accumule des duplicates)

## Garde-fous

- Sub-agent ne fabrique JAMAIS year/title incertain (confidence < 80%
  → blocked).
- Fusions traçables : la ref source passe en `retracted` avec
  `retracted_reason: merged_into:<target>`. Réversible via git.
- Le hook `sota_sync` automatique met à jour TOUS les SOTAs qui citent
  les slugs mergés.
- Backup git du vault avant chaque mutation (`_ensure_git_backup`).
