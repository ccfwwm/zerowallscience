---
description: Nettoie les wikilinks invalides d'un SOTA (vers refs retracted, refs `_0000_*` orphelines, suffixes numériques `_2_3_4`, fichiers techniques `20_ATLAS/`, `30_DEV/`, `.canvas`, slugs non-bibliographiques). Opère uniquement sur le SOTA, jamais sur le registre. Backup git auto avant `--apply`.
---

# `/paper-trail:purge <SOTA-path>` — Nettoyage des wikilinks invalides

Étape 2 du pipeline cible refondu. Scanne tous les wikilinks d'un SOTA
et corrige les 6 cas invalides connus. Ne touche **pas** au registre
(c'est `/paper-trail:arbitrate` ou `:registry-cleanup` qui font ça).

## Usage

```
/paper-trail:purge <SOTA-path>           # dry-run (montre le plan)
/paper-trail:purge <SOTA-path> --apply   # applique + backup git
```

## Ce que fait Claude

1. **Vérifie git initialisé** dans le vault (sinon refuse).

2. **Lance le plan** :
   ```bash
   python3 -m pipeline purge <SOTA-path>
   ```
   Affiche le récap : combien de wikilinks invalides par catégorie, avec
   les 15 premiers détails (numéro de ligne, wikilink, action prévue).

3. **Si `--apply`** :
   ```bash
   python3 -m pipeline purge <SOTA-path> --apply
   ```
   Commit git auto avant modification, applique les substitutions et
   suppressions, affiche le compte final.

## Les 6 cas détectés

| Cas | Détection | Action |
|---|---|---|
| A | wikilink vers ref `state=retracted` avec `retracted_reason=merged_into:X` | remplace par `[[X]]` |
| A' | wikilink vers ref `state=retracted` pure | strip (garde texte humain) |
| B | wikilink vers `lastname_0000_*` avec sibling `lastname_YYYY_*` validé | remplace par sibling |
| C | wikilink avec suffixe numérique moche (`_2_3`, `_2_3_4`) | strip |
| D | wikilink vers fichier technique (path `20_ATLAS/`, `30_DEV/`, ext `.canvas`) | strip |
| D' | wikilink vers slug non-bibliographique TitleCase (`IR_Spec_Preliminaire`) | strip |

## Style

- Concis. Une phrase par étape.
- En cas d'erreur (SOTA introuvable, backup git échoué), explique et propose
  un retry.
- Pas de modification du registre (pas d'effet de bord).
