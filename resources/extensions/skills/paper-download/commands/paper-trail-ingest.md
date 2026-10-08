---
description: Ingest the citations of one SOTA into the registry. Extracts bibliographic sections, parses citations via the citation-parser sub-agent, resolves DOI via Crossref/S2, deduplicates against the registry, creates new candidate refs, and substitutes free-text citations with [[wikilinks]]. Required first step to make a legacy SOTA conform to the paper-trail pipeline.
---

# `/paper-trail:ingest <SOTA-path>` — Ingest one SOTA

Étape 1 du pipeline cible : convertit un SOTA écrit en texte libre en
un SOTA conforme (wikilinks vers refs registre).

## Usage

```
/paper-trail:ingest <SOTA-path>                  # dry-run par défaut
/paper-trail:ingest <SOTA-path> --apply          # applique
```

## Ce que fait Claude

1. **Vérifie git initialisé** dans le vault (sinon refuse — propose
   `pipeline ingest --init-git` la première fois).

2. **Extrait les sections bibliographiques** :
   ```bash
   python3 -m pipeline ingest <SOTA-path> --extract-only
   ```
   Retourne sur stdout un JSON `[{header, is_excluded, raw_text, ...}]`.

3. **Pour chaque section non exclue**, invoque le sub-agent
   `citation-parser` :
   ```
   Agent(subagent_type="citation-parser", prompt=<contenu_section_brut>)
   ```
   Le sub-agent retourne un JSON `[{author, year, title, doi?, raw, ...}]`.

4. **Consolide** tous les JSON de citations en un seul fichier
   `/tmp/citations_<sota_stem>.json`.

5. **Lance l'ingestion** :
   ```bash
   python3 -m pipeline ingest <SOTA-path> \
       --citations-json /tmp/citations_<sota_stem>.json [--apply]
   ```
   Sans `--apply` : montre ce qui serait ingéré (dry-run).
   Avec `--apply` : commit git auto, crée refs candidates, substitue
   le texte par `[[wikilinks]]`.

6. **Présente le récap intermédiaire** : N nouvelles refs créées, N
   réutilisées, N substitutions, N skipped (low confidence), N erreurs.

7. **Sweep automatique des textbooks incomplets** (uniquement si `--apply`) :
   - Liste les candidates :
     ```bash
     python3 -m pipeline resolve-textbooks --list > /tmp/textbook_candidates_<sota_stem>.json
     ```
   - Si le JSON est non-vide, invoque le sub-agent `textbook-resolver` :
     ```
     Agent(subagent_type="textbook-resolver",
           prompt=<contenu de /tmp/textbook_candidates_<sota_stem>.json>)
     ```
   - Sauve le JSON retourné dans `/tmp/textbook_decisions_<sota_stem>.json`,
     applique :
     ```bash
     python3 -m pipeline resolve-textbooks \
         --apply-from /tmp/textbook_decisions_<sota_stem>.json
     ```
   - Aucune décision humaine intermédiaire : le sub-agent applique ses
     règles documentées (`agents/textbook-resolver.md`) — merge / complete /
     blocked. Les `blocked` restent visibles via `pipeline doctor`.

8. **Récap final consolidé** : ingestion + sweep textbooks.

9. **Si --apply réussit**, propose à l'utilisateur :
   - Lancer la cascade pour les nouvelles refs :
     `pipeline run --loop` (étape 2 du pipeline)
   - Ou enchaîner sur l'audit-sota pour valider claim ↔ PDF.

## Style

- Concis. Une phrase par étape.
- Pas de jargon technique : "sections bibliographiques" plutôt que
  "regex-matched headers".
- En cas d'erreur (parser timeout, JSON invalide), explique et propose
  un retry ciblé sur la section qui a échoué.
