---
description: Dernière passe du pipeline cible refondu. Insère les wikilinks finaux dans le SOTA (vers PDF si validé, sinon vers ancre dans une section `## Statut des sources` régénérée idempotemment en bas du fichier). Présuppose que les passes identify/purge/acquire ont été lancées.
---

# `/paper-trail:linkify <SOTA-path>` — Wikilinks finaux + section Statut

Étape 4 du pipeline cible refondu. Insère les wikilinks finaux dans le
SOTA et ajoute/régénère la section `## Statut des sources` en bas.

## Usage

```
/paper-trail:linkify <SOTA-path>           # dry-run (compte uniquement)
/paper-trail:linkify <SOTA-path> --apply   # applique + backup git
```

## Ce que fait Claude

1. **Vérifie git initialisé** dans le vault.

2. **Extrait les sections + sub-agent citation-parser** (parallèle), comme
   pour identify, produisant `/tmp/citations_<sota_stem>.json`.

3. **Lance le linkify** :
   ```bash
   python3 -m pipeline linkify <SOTA-path> \
       --citations-json /tmp/citations_<sota_stem>.json [--apply]
   ```

   Comportement par mention :
   - Si la ref est validée (state=`page1_validated` ou
     `sota_cited_confirmed`) AVEC un `pdf_path` → wikilink direct vers
     le PDF, par exemple :
     `[[Sources/Knuth_1965_Translation.pdf|knuth_1965]] — Knuth 1965 (LR)`
   - Sinon → wikilink vers une ancre `#source-<lastname>-<year>` dans
     une section `## Statut des sources` régénérée en bas du SOTA.
     Exemple : `[[#source-younger-1967|younger_1967]] — Younger 1967`

4. **Régénère la section `## Statut des sources`** idempotemment,
   encadrée par :
   ```
   <!-- paper-trail:statut:begin -->
   ## Statut des sources
   ...
   <!-- paper-trail:statut:end -->
   ```
   5 sous-sections : validées / en cours / bloquées / rétractées / non créées.
   Chaque entrée a une ancre `<a id="source-..."></a>` ciblable.

5. **Présente le récap** : N wikilinks PDF + N wikilinks ancre + N entrées
   dans la section Statut.

## Style

- Concis.
- En cas d'erreur (backup git échoué, SOTA introuvable), explique et propose
  un retry.
