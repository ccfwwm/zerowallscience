---
description: Inspect a single reference in detail (identity, PDF status, acquisition history with verdicts, citation context in vault, state transitions) and decide its fate. Offers actionable decisions based on the ref's current state.
---

# `/paper-trail:decide <slug>` — Inspect & decide on one ref

Pour une ref précise : montre tout ce qui est nécessaire pour décider, et
applique la décision.

## Usage

```
/paper-trail:decide shannon_1948_mathematical_theory
/paper-trail:decide                                    # liste les refs problématiques d'abord
```

## Ce que fait Claude

1. **Récupérer toute l'info de la ref** via :
   ```bash
   python3 tools/review_problems.py --ref-slug <slug> --output -
   ```
   (ou affiche directement le contenu du fichier registre `_registry/refs/<slug>.md`
   + scan des citations dans le vault si besoin)

2. **Présenter en français concis** :
   - Identité : auteur, année, titre, UID
   - État actuel + raison du blocage
   - PDF : présent sur disque ? sha ? page 1 validée ?
   - Sources tentées : liste des sources cascade avec verdict (no_source /
     failed / page1_failed / success)
   - Citations dans le vault : dans quels SOTAs/articles cette ref est-elle
     mentionnée ? avec extrait de contexte
   - Historique d'états (state_history) si non trivial

3. **Demander la décision** via AskUserQuestion. Les options proposées
   dépendent de l'état :

   - Si `blocked_human:cascade_exhausted` :
     - **retract** : la ref n'a pas d'importance, on l'écarte
     - **unblock** : retenter la cascade (utile si tu as ajouté un proxy, ou
       changé la config réseau)
     - **investigate** : tu vas corriger l'auteur/titre/uid dans le frontmatter
     - **keep** : laisser comme ça (no-op)

   - Si `uid_resolved` (cascade épuisée mais pas encore blocked) :
     - **retract** / **blocked** / **investigate** / **keep**

   - Si `awaiting_rtfm_ocr` :
     - **retract** / **wait** (laisser RTFM finir l'OCR) / **investigate**

4. **Appliquer** la décision via :
   ```bash
   python3 -m pipeline arbitrate <slug> --decision <X> --reason "<reason>"
   ```

5. **Confirmer** : afficher le nouvel état de la ref.

## Style

- Concis, termes du domaine (recherche / musicologie), pas de jargon FSM.
- "État actuel" plutôt que "state", "sources tentées" plutôt que "acquisition_attempts".
- Pour les citations : extrait de ±2 lignes autour du `[[slug]]` pour
  voir le contexte (de quoi parle la SOTA quand elle cite cette ref).
- Toujours demander avant d'appliquer une décision destructrice (retract).

## Sans argument

Si l'utilisateur tape `/paper-trail:decide` sans slug :
- Lister les refs actuellement problématiques (non `page1_validated`,
  non `retracted`, non `sota_cited_confirmed`)
- Lui proposer de choisir laquelle traiter (ou de toutes les enchaîner)
