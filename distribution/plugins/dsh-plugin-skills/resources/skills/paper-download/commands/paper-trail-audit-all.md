---
description: Batch audit of every SOTA in the vault. For each SOTA, identifies refs that are page1_validated (technical OK) but not yet sota_cited_confirmed (content audited), and launches audit-sota on those SOTAs. Returns a per-SOTA summary at the end.
---

# `/paper-trail:audit-all` — Audit claims across the whole vault

Variante batch de `/paper-trail:audit-sota`. Parcourt toutes les SOTAs et
lance l'audit sur celles qui contiennent des refs non encore confirmées
au niveau du contenu.

## Usage

```
/paper-trail:audit-all                        # toutes les SOTAs
/paper-trail:audit-all --sota-pattern "*tempo*"   # filtre par nom de SOTA
/paper-trail:audit-all --dry-run              # liste les SOTAs à auditer, ne lance rien
```

## Ce que fait Claude

1. **Lister les SOTAs du vault** via l'adapter :
   ```python
   from adapters import get_adapter
   adapter = get_adapter()
   sotas = adapter.find_sotas()
   ```

2. **Pour chaque SOTA**, identifier les refs citées (via wikilinks) et leur
   état FSM courant :
   ```bash
   python3 -c "
   from adapters import get_adapter
   from pipeline.registry import load_ref
   from pipeline.config import REFS
   adapter = get_adapter()
   sota_path = ...
   for slug in adapter.parse_citations(sota_path):
       ref = load_ref(REFS / f'{slug}.md')
       if ref: print(f'{slug}: {ref.state}')
   "
   ```

3. **Filtrer** : ne garder que les SOTAs qui ont au moins UNE ref en
   `page1_validated` (= PDF acquis, page 1 validée techniquement, mais
   contenu pas encore audité contre les claims de la SOTA).

4. **Présenter à l'utilisateur** :
   - Tableau compact : nom SOTA, nombre total refs, nombre `page1_validated`
     à auditer, nombre déjà `sota_cited_confirmed`, nombre `retracted`.
   - Demander confirmation avant de lancer (l'audit peut prendre du temps
     car lit les PDFs).

5. **Lancer audit-sota** pour chaque SOTA filtrée. Utilise la skill
   `paper-trail:sota-auditor` (déjà existante) ou directement la commande :
   ```
   /paper-trail:audit-sota <SOTA_path>
   ```

6. **Récap final** :
   - Par SOTA : nombre de refs validées (VRAI), corrigées (ADJUST), retractées
     (INVALID), non vérifiables (UNVERIFIABLE).
   - Total cumulé.

## Style

- Concis. Tableau markdown ≤ 120 caractères de large.
- Le batch peut être long → annoncer le temps estimé (≈ 2 min par SOTA).
- Permettre interruption : si l'utilisateur dit stop, sauvegarde la
  progression dans `plans/audit_all_<date>.md`.
