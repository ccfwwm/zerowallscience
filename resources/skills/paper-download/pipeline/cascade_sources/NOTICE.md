# Attribution — pipeline/cascade_sources/

Les modules de ce dossier sont **adaptés** depuis le projet
[paper-search-mcp](https://github.com/openags/paper-search-mcp)
(Copyright (c) 2025 OPENAGS) sous licence MIT.

## Modules intégrés

- `base.py`, `paper.py`, `utils.py`, `_pscfg.py` : infrastructure commune
- 14 plateformes : `dblp.py`, `semantic.py`, `pmc.py`, `europepmc.py`,
  `biorxiv.py`, `medrxiv.py`, `openaire.py`, `citeseerx.py`, `doaj.py`,
  `base_search.py`, `zenodo.py`, `ssrn.py`, `iacr.py`, `oaipmh.py`

## Modifications

- Imports relatifs adaptés (`..paper` → `.paper`, `..config` → `._pscfg`)
- `pypdf` import paresseux (`try/except ImportError`) pour rendre la
  dépendance optionnelle (n'impacte que `read_paper()`)

## Licence

MIT (cf. paper-search-mcp upstream pour le texte complet).
