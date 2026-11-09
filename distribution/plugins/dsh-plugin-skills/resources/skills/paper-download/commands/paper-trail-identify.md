---
description: "Première passe du pipeline cible refondu (read-only). Produit un rapport d'identification : pour chaque mention citée dans le SOTA, indique si la fiche existe déjà au registre, son état actuel, si elle a un PDF, et l'action recommandée (réutiliser / créer / passer en revue). Ne modifie ni le SOTA ni le registre."
---

# `/paper-trail:identify <SOTA-path>` — Rapport d'identification (read-only)

Étape 1 du pipeline cible refondu (avant purge / acquire / linkify).
Produit un rapport sans toucher au SOTA ni au registre.

## Usage

```
/paper-trail:identify <SOTA-path>
```

## Ce que fait Claude

1. **Extrait les sections bibliographiques** :
   ```bash
   python3 -m pipeline ingest <SOTA-path> --extract-only
   ```
   Retourne un JSON `[{header, is_excluded, raw_text, ...}]`.

2. **Pour chaque section non exclue**, invoque le sub-agent
   `paper-trail:citation-parser` (en parallèle), qui écrit chaque JSON
   dans `/tmp/section_<i>_citations.json`.

3. **Consolide** les JSON en un seul fichier
   `/tmp/citations_<sota_stem>.json`.

4. **Lance le rapport** :
   ```bash
   python3 -m pipeline identify <SOTA-path> \
       --citations-json /tmp/citations_<sota_stem>.json
   ```
   Affiche pour chaque mention :
   - action recommandée (reuse / reuse_retracted / create / skipped_low)
   - slug matché ou would-be-created
   - état actuel + présence PDF
   - PDF orphelin trouvé éventuel

5. **Présente le récap** + propose les passes suivantes :
   - `/paper-trail:purge <SOTA>` si wikilinks vers retracted détectés
   - `/paper-trail:acquire <SOTA>` pour les fiches sans PDF
   - `/paper-trail:linkify <SOTA>` pour insérer les wikilinks finaux

## Style

- Concis. Pas de jargon technique.
- En cas d'erreur sur une section, propose un retry ciblé.
