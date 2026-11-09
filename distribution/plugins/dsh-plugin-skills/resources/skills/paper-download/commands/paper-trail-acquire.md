---
description: "Troisième passe du pipeline cible refondu. Lance la cascade PDF (10 sources : Crossref OA + arXiv + OpenAlex + Unpaywall + HAL + CORE + éditeur par DOI + archive.org + WebSearch ; jusqu'à 17 avec les voies par navigateur et les sources étendues opt-in) ciblée sur les refs d'un SOTA donné. Différent de `pipeline run` qui itère sur TOUTES les refs actives — `acquire` ne traite que les refs citées par le SOTA en cours."
---

# `/paper-trail:acquire <SOTA-path>` — Cascade ciblée

Étape 3 du pipeline cible refondu. Pour chaque fiche citée par le SOTA
mais sans PDF (state `candidate`, `uid_resolved`, `pdf_acquired`,
`awaiting_rtfm_ocr`, `needs_reacquisition`), lance la cascade jusqu'à
`page1_validated` ou blocage.

## Usage

```
/paper-trail:acquire <SOTA-path>           # dry-run (compte les cibles)
/paper-trail:acquire <SOTA-path> --apply   # exécute les transitions
```

## Ce que fait Claude

1. **Détermine les cibles** : appelle
   ```bash
   python3 -m pipeline acquire <SOTA-path>
   ```
   La CLI scanne les wikilinks existants du SOTA + les slugs créés
   précédemment par identify (si `--citations-json` fourni), produit
   la liste des slugs à pousser dans la FSM.

2. **Lance la cascade** (mode `--apply`) :
   - Pour chaque slug : itère `plan_for + transitions worker B` jusqu'à
     terminal ou max 5 itérations.
   - Cascade complète : Crossref OA → arXiv → OpenAlex → Unpaywall →
     HAL → CORE → archive.org → WebSearch → (opt-in : Sci-Hub + AA).

3. **Présente le récap** : N succeeded (page1_validated), N pending
   (cascade en attente d'humain), N blocked.

4. **Propose** : `/paper-trail:linkify <SOTA>` pour insérer les
   wikilinks finaux maintenant que les PDFs sont prêts.

## Style

- Concis. Pas de détail de chaque source de cascade (le worker B s'en
  occupe en interne).
- Si des refs sont blocked → propose `/paper-trail:arbitrate` ou
  `/paper-trail:decide <slug>`.
