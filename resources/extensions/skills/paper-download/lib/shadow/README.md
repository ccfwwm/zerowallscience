# lib/shadow/ — Shadow libraries (opt-in)

Ce dossier contient les intégrations des sources d'acquisition de type
shadow library (Anna's Archive, Sci-Hub) qui sont **désactivées par
défaut**.

## ⚠️ Disclaimer légal

L'utilisation d'Anna's Archive et de Sci-Hub peut violer le droit
d'auteur dans votre juridiction. **Voir `DISCLAIMER.md` à la racine du
plugin pour les détails complets.**

Activation explicite requise :

```bash
export RESEARCH_ENABLE_SHADOW_LIBS=1
```

Le plugin :
- Affiche un disclaimer sur stderr au premier appel de chaque session
- Trace toutes les acquisitions via shadow dans le registre
  (`acquisition_attempts[].via` préfixé `_optin`)
- N'héberge aucun contenu protégé (client HTTP seulement)

## Modules

- `scihub.py` — `try_scihub(ref)` : résolution PDF via Sci-Hub
  multi-mirror (utilise `lib/s2_resolver.try_scihub` comme helper)
- `annas_archive.py` — `try_annas_archive(ref)` + helpers
  `_aa_md5_from_doi`, `_aa_md5_from_title`, `_md5_download_cascade` :
  cascade AA scidb → AA title-search → libgen.li → library.lol
- `annas_archive_helper.py` — helper de bas niveau (cloudscraper,
  parser BeautifulSoup). Au 2026-05-24, son parser est obsolète, on
  utilise le parsing HTML direct dans `annas_archive.py`. Conservé pour
  référence et au cas où le parser serait réparé.

## Intégration dans la cascade

`pipeline/cascade.py` construit `CASCADE` conditionnellement :

```python
if os.environ.get("RESEARCH_ENABLE_SHADOW_LIBS") == "1":
    from lib.shadow.scihub import try_scihub
    from lib.shadow.annas_archive import try_annas_archive
    _warn_shadow_disclaimer_once()
    CASCADE += [
        ("scihub_optin", try_scihub),
        ("annas_archive_optin", try_annas_archive),
    ]
```

Sans la variable, la cascade saute directement de `archive_org` (étape
7) à `websearch` (étape 10 → 8 effectif).
