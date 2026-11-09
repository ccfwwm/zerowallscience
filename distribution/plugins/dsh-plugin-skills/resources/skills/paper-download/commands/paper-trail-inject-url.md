---
description: Injecte une URL OA connue (HAL, dépôt uni, NIME, page perso) pour une ref dont la cascade automatique a échoué, puis relance l'acquisition + validation page 1.
---

# `/paper-trail:inject-url <slug> <url>` — URL OA fournie manuellement

Quand la cascade automatique épuise toutes ses sources mais que vous
savez où le PDF est disponible (page d'auteur, dépôt universitaire,
HAL, NIME, eScholarship…), cette commande injecte l'URL dans le
frontmatter de la ref puis relance la cascade. Aucun bricolage manuel.

Le résolveur landing→PDF du pipeline suit automatiquement la balise
`<meta name="citation_pdf_url">` (norme Highwire Press), donc une URL
de **page de dépôt** fonctionne — pas besoin du PDF direct.

## Usage

```
/paper-trail:inject-url <slug> <url>
```

Exemple :

```
/paper-trail:inject-url murgul_2024_polyrhythm \
    https://publikationen.bibliothek.kit.edu/1000183782
```

## Ce que fait Claude

1. **Vérifie la ref** : la ref `<slug>` doit exister dans le registre
   et être en état `uid_resolved`, `needs_reacquisition`, ou
   `blocked_human:cascade_exhausted_needs_manual`. Sinon refuse en
   expliquant.

2. **Écrit `oa_url:` dans le frontmatter** :

   ```bash
   python3 -c "
   import sys; sys.path.insert(0, 'pipeline')
   from pipeline.registry import load_ref, save_ref
   r = load_ref('<slug>')
   r.frontmatter['oa_url'] = '<url>'
   save_ref(r)
   "
   ```

3. **Si la ref était bloquée**, débloque-la pour que la cascade
   puisse la reprendre :

   ```bash
   python3 -m pipeline arbitrate <slug> --decision unblock \
       --reason "manual oa_url provided"
   ```

4. **Relance la cascade ciblée** :

   ```bash
   python3 -m pipeline run --ref <slug>
   ```

   La nouvelle source `manual_oa_url` est en tête de cascade donc
   essayée en premier.

5. **Récap** : si succès, affiche le chemin PDF + sha256 ; sinon liste
   ce qui a échoué (HTTP 404, page sans `citation_pdf_url`, validation
   page 1 KO, etc.) et propose les pistes du fichier
   `_hints/<slug>.md` généré automatiquement.

## Quand utiliser

- Le fichier `_hints/<slug>.md` a été généré (la cascade a épuisé) ET
  vous connaissez une URL OA fiable.
- Plus rapide que de télécharger le PDF à la main puis renseigner
  `pdf_path` manuellement.

## Alternative : déposer le PDF en local

Si vous avez déjà le PDF sur disque (download terminé, archive perso),
préférez :

```yaml
# Dans le frontmatter de la ref :
pdf_path: 11_Biblio_MIR/Sources/Author_Year_Title.pdf
```

Puis `python3 -m pipeline run --ref <slug>`. La validation page 1 sera
appliquée comme pour tout PDF acquis.

## Style

- Concis. Une phrase par étape.
- Si la cascade refuse encore après injection, ne pas bricoler :
  reporter ce qui a échoué dans la conversation, proposer le dépôt
  local en alternative.
