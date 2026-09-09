---
description: Review and arbitrate problematic references (cascade-exhausted, unresolved UID, awaiting OCR). Generates an up-to-date report, walks through cases by category, and applies arbitration decisions to the registry.
---

# `/paper-trail:review` — Arbitrate problematic refs

Pour traiter en une session toutes les refs qui ne peuvent pas progresser
automatiquement et demandent une décision humaine.

## Usage

```
/paper-trail:review                           # tous les cas
/paper-trail:review --auto-retract-uncited    # raccourci : retract en lot les non-citées
/paper-trail:review --only retract            # seulement les artefacts évidents
/paper-trail:review --only blocked            # seulement les paywalls
/paper-trail:review --only investigate        # seulement les homonymies
/paper-trail:review --batch                   # propose une décision par ref, l'utilisateur valide en lot
```

## Raccourci `--auto-retract-uncited`

Empiriquement, 90 %+ des refs problématiques sont des refs non citées en
dehors du registre. Pour les traiter en une commande :

```bash
python3 -m pipeline retract-uncited            # dry-run (montre la liste)
python3 -m pipeline retract-uncited --apply    # exécute les retract
```

Le pipeline scanne le vault, identifie les refs actives non citées hors
`_registry/INDEX.md`, et propose de toutes les retract en bloc.

## Ce que fait Claude pendant cette commande

1. **Régénère le rapport à jour** :
   ```bash
   python3 tools/review_problems.py \
     --states candidate,uid_resolved,awaiting_rtfm_ocr \
     --output plans/review_<YYYY-MM-DD>.md
   ```

2. **Lit le rapport et compte par catégorie** (RETRACT / BLOCKED_HUMAN
   / INVESTIGATE / WAIT / REVIEW). Présente le total à l'utilisateur.

3. **Traite par batch, dans cet ordre** :
   - D'abord les **RETRACT évidents** (title vide ou "untitled", uid absent,
     citée nulle part ou seulement dans `INDEX.md`) → propose une liste en
     bloc, demande validation globale.
   - Ensuite les **BLOCKED_HUMAN** (auteur+titre OK, ≥8 sources tentées,
     toutes en échec) → propose une liste en bloc.
   - Enfin les **INVESTIGATE** : un par un, car nécessite une décision
     d'humain (homonymie ? typo dans frontmatter ?).

4. **Pour chaque batch validé**, Claude exécute :
   ```bash
   python3 -m pipeline arbitrate <slug> --decision <X> --reason "<reason>"
   ```
   Une commande par ref (séquentiel, journal préservé).

5. **À la fin** : affiche `pipeline status` pour voir le solde et propose
   de lancer `pipeline doctor` pour vérifier la cohérence du registre.

## Style de communication

- Pas de jargon technique. Termes du domaine recherche/musicologie.
- Concis : pour chaque ref proposée, 1-2 lignes max (auteur, année,
  titre, où elle est citée, décision proposée).
- Lots de 10-20 refs pour permettre une validation rapide.
- Toujours demander confirmation avant d'appliquer un batch.

## Trois décisions possibles

| Décision      | Quand                                                    | Effet sur la ref            |
|---------------|----------------------------------------------------------|-----------------------------|
| `retract`     | la ref n'existe pas (artefact d'extraction, hallucination) | state → `retracted`         |
| `blocked`     | la ref existe mais inaccessible (paywall, hors-ligne)      | state → `blocked_human:…`   |
| `investigate` | homonymie ou frontmatter à corriger                        | flag posé + `blocked_by` levé pour permettre retentative |

## Indices pour décider (heuristique)

- **RETRACT probable** :
  - title vide ou `untitled`
  - uid absent ET nombre de tentatives sources = 0
  - cité uniquement dans `INDEX.md` (pas dans une vraie SOTA)
  - auteur générique (e.g. "cognitive", "deepsalience") = probable artefact

- **BLOCKED_HUMAN probable** :
  - auteur réel + titre cohérent + année plausible
  - ≥8 sources tentées, toutes en échec
  - cité dans 1+ SOTA réelle (pas que `INDEX.md`)

- **INVESTIGATE probable** :
  - last_reason mentionne "homonym" ou "mismatch"
  - title court ou ambigu
  - auteur à orthographe inhabituelle (Müller vs Mueller)
