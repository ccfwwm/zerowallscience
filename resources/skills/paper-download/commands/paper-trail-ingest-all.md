---
description: Batch INGEST across the entire vault. Scans all SOTAs, identifies those with bibliographic sections containing free-text citations, then runs /paper-trail:ingest on each one sequentially. Reports per-SOTA summary at the end. The single batch entry point to make a legacy vault fully conform to the paper-trail pipeline.
---

# `/paper-trail:ingest-all` — Batch INGEST on the whole vault

Variante batch de `/paper-trail:ingest`. Traite tous les SOTAs ayant
des sections bibliographiques avec citations en texte libre, en une
seule session.

## Usage

```
/paper-trail:ingest-all                   # dry-run par défaut sur tout le vault
/paper-trail:ingest-all --apply           # applique sur tout
/paper-trail:ingest-all --pattern "*tempo*"   # filtre par nom de SOTA
```

## Ce que fait Claude

1. **Vérifie git initialisé** (sinon refuse).

2. **Scan global** :
   ```bash
   python3 -m pipeline ingest --all
   ```
   Liste les SOTAs avec sections bibliographiques candidates et leur
   nombre. Présente le tableau à l'utilisateur.

3. **Demande confirmation** avant de lancer le batch :
   - Combien de SOTAs vont être traités ?
   - Estimation : ~30s par SOTA (sub-agent parser + Crossref + DOI
     resolution + dédup + substitutions).
   - Le commit git auto sera fait avant chaque SOTA.

4. **Pour chaque SOTA** (séquentiel, pour éviter conflit git) :
   - Lance `/paper-trail:ingest <SOTA>` ou directement la chaîne
     `ingest --extract-only` → sub-agent → `ingest --citations-json --apply`
   - Agrège le résultat (new_refs, reused_refs, substitutions, erreurs)

5. **Récap final** : tableau par SOTA + totaux :

   ```
   SOTA                                   new  reused  subst  errors
   SOTA_Beat_Tracking                     3    0       3      0
   SOTA_Bernard_Bel_Temperaments          12   2       14     1
   ...
   Total                                  N    N       N      N
   ```

6. **Étape suivante** : propose de lancer
   `pipeline run --loop` (cascade sur les nouvelles refs candidates),
   puis `/paper-trail:audit-all` (audit claim ↔ PDF).

## Garde-fous

- **Interruption** : si l'utilisateur dit stop pendant le batch,
  sauvegarder la progression (SOTAs déjà traités) dans
  `plans/ingest_all_<date>.md`. La reprise re-démarre au SOTA suivant.

- **Skip si déjà ingéré** : si un SOTA n'a plus aucune section
  candidate (toutes les citations sont déjà en wikilinks), skip
  silencieusement.

- **Skip section écartée** : sections « Écartées », « Hallucinées »,
  « Retracted » volontairement ignorées.

## Style

- Tableau compact ≤ 120 caractères.
- Pour les batches longs (> 20 SOTAs), afficher la progression toutes
  les 5 SOTAs avec ETA.
