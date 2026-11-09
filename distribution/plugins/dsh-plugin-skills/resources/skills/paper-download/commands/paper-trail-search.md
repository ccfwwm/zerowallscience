---
description: Search the validated registry for references matching a topic (author, title, year, slug). Returns only refs in state page1_validated or sota_cited_confirmed by default — i.e. references that have been technically validated (PDF acquired, page 1 OK) or fully audited (content validated against PDF). Used by sota-writer / paper-writer to find truthful sources, and by the user to query what's been confirmed.
---

# `/paper-trail:search <query>` — Search the validated registry

Étape 5 du pipeline cible : interrogation du registre validé.

## Usage

```
/paper-trail:search beat tracking                  # par défaut, refs sota_cited_confirmed
/paper-trail:search "tempo estimation" --include-pending   # inclut page1_validated
/paper-trail:search heydari --limit 10
```

## Ce que fait Claude

1. **Lance la recherche** :
   ```bash
   python3 -m pipeline search "<query>" [--include-pending] [--limit N]
   ```

2. **Filtre** :
   - Par défaut : refs en `sota_cited_confirmed` (claims audités contre PDF)
   - Avec `--include-pending` : ajoute `page1_validated` (PDF OK techniquement,
     claims non audités)

3. **Sortie** : liste compacte
   ```
   [sota_cited_confirmed] Heydari, M.            (2021) — BeatNet: CRNN and Particle...
       heydari_2021_beatnet
   [page1_validated]      Chang, Y.-C. & Su, L.  (2024) — BEAST: Online Joint Beat...
       chang_2024_beast
   ```

4. **Propose les usages** :
   - Si tu écris un SOTA / paper : copier le slug et l'utiliser comme `[[wikilink]]`
   - Si tu veux la fiche complète d'une ref : `/paper-trail:decide <slug>`

## Quand utiliser cette commande

- **Avant d'écrire** : pour ne citer que du validé
- **Pour vérifier la couverture** : « est-ce que j'ai des refs sur tel sujet ? »
- **Pour booster sota-writer** : après identification des candidates,
  cette commande montre lesquelles sont déjà dans ton registre validé
