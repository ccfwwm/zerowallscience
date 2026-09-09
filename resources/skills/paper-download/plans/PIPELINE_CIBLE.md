# Pipeline cible paper-trail — module INGEST + alignement vault ↔ registre

## Context

Le plugin paper-trail vise à produire des SOTAs / articles **sans
citation hallucinée**, et à permettre d'interroger un registre de
références **validées** (PDF acquis, page 1 OK, claims audités) pour
deux usages :
- **Écrire** un SOTA / article qui ne cite que du vérifié
- **Auditer** un SOTA / article existant claim-par-claim

Aujourd'hui le plugin a tout sauf l'**étape critique** qui convertit
le vault en source du registre : il manque la lecture des SOTAs
existantes, l'extraction de leurs citations (en wikilink **ou** en
texte libre), la création des entrées registre correspondantes, et
le remplacement du texte libre par des wikilinks.

Conséquence dans le vault actuel : sur 66 SOTAs, **62 contiennent des
citations rédigées en texte libre** ("Heydari et al., 2021…") jamais
ingérées. Le pipeline ne les voit pas. On a un faux sentiment de
complétude (631 refs validées) alors que des centaines de citations
réelles n'ont pas d'entrée registre.

Cette session conçoit le **module INGEST** qui comble le trou, et
acte l'absorption de l'existant **par le pipeline cible** (pas par
patch à la marge).

## Décisions humaines actées

| # | Question | Réponse retenue |
|---|---|---|
| 1 | Backup avant qu'INGEST modifie un SOTA | `git init` du vault avec `.gitignore` excluant `*.pdf`/`*.epub`/`Sources/`. Commit auto avant chaque session INGEST. |
| 2 | Parser citations en texte libre | **Sub-agent Claude** pour toutes les sections bibliographiques (pas de regex artisanales) |
| 3 | Dédup contre registre existant | DOI strict d'abord ; sinon fuzzy auteur exact + année exacte + Levenshtein titre ≥ 0.8 |
| 4 | Hooks préventifs | **Activés par défaut**. PostToolUse détecte du texte de citation sans wikilink → propose INGEST. PreToolUse refuse les SOTAs avec I21/I22/I23 > 0. |
| 5 | Sections « écartées » / « hallucinées » | INGEST les **skip** (volontairement exclues, on ne réintroduit pas) |

## Approche

### Pipeline cible (7 étapes)

```
Vault SOTAs/articles
       │
       ▼
[1] INGEST          scan + extract + identify + dédup + créer refs + substituer
       │            (sub-agent Claude pour parser, Crossref/S2 pour DOI)
       ▼
[2] ACQUIRE         cascade PDF 10 sources (existant)
       │
       ▼
[3] VALIDATE        page 1 anti-homonymie (RTFM-first + pdftotext, existant)
       │
       ▼
[4] AUDIT           claim ↔ PDF via sota-auditor (existant à étendre)
       │
       ▼
[5] INTERROGATE     /paper-trail:search <topic> sur registre validé (nouveau, simple)
       │
       ▼
[6] WRITE           sota-writer / paper-writer (existant)
[7] REVIEW          citation-receipts pour article externe (existant)
```

L'unité primaire est le **SOTA dans le vault**. Le registre est
dérivé. Toute citation détectée dans un SOTA a une entrée registre.

### Comment l'existant est absorbé (sans scotch)

- **631 refs `page1_validated`** : intactes. INGEST réutilise leur
  slug si match DOI ou fuzzy.
- **277 refs `retracted`** : intactes. Si une SOTA cite encore le
  texte d'une ref retracted, INGEST signale via I23 (l'utilisateur
  tranche).
- **2 refs `blocked_human:*`** : intactes.
- **66 SOTAs préexistantes** : passent par INGEST. Toutes leurs
  citations (texte libre, wikilinks, bibliographies) sont absorbées.

## Critical files à créer ou modifier

### Nouveau module INGEST

- **`pipeline/ingest.py`** (~300 LOC) — orchestrateur : `ingest_sota(sota_path) -> IngestResult`
  Sous-fonctions : `_scan_sections`, `_parse_via_subagent`,
  `_identify_via_crossref_s2`, `_reconcile_with_registry`,
  `_create_or_reuse_ref`, `_substitute_to_wikilink`.

- **`pipeline/cli.py`** (modifier) — ajouter sous-commande
  `pipeline ingest <path>` et `pipeline ingest --all [--dry-run|--apply]`.

- **`commands/paper-trail-ingest.md`** (nouveau) — slash command par SOTA.

- **`commands/paper-trail-ingest-all.md`** (nouveau) — batch sur tout le vault.

### Extensions adapter

- **`adapters/base.py`** (modifier) — ajouter méthode abstraite
  `extract_free_text_citations(sota_path) -> list[FreeTextCitation]`.
- **`adapters/obsidian.py`** (modifier) — implémente la détection des
  sections bibliographiques (titres `## Références`, `## Bibliographie`,
  callouts `> [!cite]`, listes numérotées + détection des citations
  inline `Auteur (YYYY)` dans le corps). Délègue au sub-agent Claude
  pour parser le contenu.

### Sub-agent parser

- **`agents/citation-parser.md`** (nouveau) — sub-agent Claude qui
  prend en entrée une section bibliographique brute et retourne JSON
  structuré `[{author, year, title, doi?, venue?, raw}]`. Isole le
  parsing LLM du contexte principal.

### Résolution DOI/UID

Réutilise l'existant :
- **`lib/oa_finder.py`** — Crossref search par auteur+titre+année
- **`lib/s2_resolver.py`** — Semantic Scholar fallback

### Substitution texte → wikilink

- Dans `pipeline/ingest.py`, fonction `_substitute_to_wikilink(sota_path, citations)`.
- **Pas de `.bak`** — commit git auto avant la session INGEST. Si pas
  de git initialisé, le plugin propose `git init` au premier
  lancement.

### Nouveaux invariants

- **`pipeline/invariants.py`** (modifier) — ajouter :
  - `check_I21` (ERROR, registry-level) — SOTA contient un pattern
    de citation texte libre détectable, jamais ingéré
  - `check_I22` (ERROR, registry-level) — wikilink dans SOTA pointe
    vers une ref absente du registre
  - `check_I23` (WARN, registry-level) — wikilink dans SOTA pointe
    vers une ref `retracted`
- Inscrire dans `REGISTRY_LEVEL_CHECKS` et `SEVERITY_BY_INVARIANT`.
- **`pipeline/tests/synthetic/refs/I21..I23_*.md`** — fixtures de test
  (3 SOTAs synthétiques).

### Hooks préventifs

- **`hooks/hooks.json`** (modifier) — ajouter :
  - PostToolUse(Write|Edit) sur fichiers SOTA (`**/SOTA_*.md` selon
    adapter) → script `hooks/post_edit_sota_check.py` qui détecte
    nouveau texte de citation sans wikilink, signale dans stderr.
  - PreToolUse(Write) sur fichiers SOTA → script
    `hooks/pre_save_sota_check.py` qui refuse si I21/I22/I23 > 0
    sur ce fichier (force passage par INGEST).
- **`hooks/post_edit_sota_check.py`** (nouveau) — vérification
  permissive (warning).
- **`hooks/pre_save_sota_check.py`** (nouveau) — vérification stricte
  (blocking).

### Backup git automatique

- **`pipeline/ingest.py::_ensure_git_backup(vault_root)`** :
  - Si `vault_root/.git` existe → `git add . && git commit -m "..."` avant
    INGEST.
  - Sinon, propose à l'utilisateur (interactif) :
    `git init && cat > .gitignore` puis premier commit.
  - Sans confirmation → refuse de tourner.

### Recherche dans le registre validé

- **`pipeline/cli.py`** (modifier) — sous-commande `pipeline search <query>`
  qui filtre `state ∈ {page1_validated, sota_cited_confirmed}` par
  match titre/auteur/keywords frontmatter.
- **`commands/paper-trail-search.md`** (nouveau) — slash command.

## Phases d'exécution

| Phase | Livrable | Effort |
|---|---|---|
| A | Module INGEST + agent citation-parser + extensions adapter | 1-2 sessions |
| B | Slash commands `ingest`, `ingest-all`, CLI `pipeline ingest` | 0.5 |
| C | Invariants I21-I23 + fixtures synthétiques | 0.5 |
| D | Run INGEST sur les 66 SOTAs réelles (dry-run, revue, apply, cascade auto) | 1 |
| E | Étendre `audit-all` pour couvrir toutes les SOTAs ingérées | 1-2 |
| F | Hooks préventifs Pre/Post + scripts | 0.5 |
| G | `pipeline search` + slash command + nettoyage commandes palliatives | 0.5 |
| **Total** | | **~7 sessions** |

## Critères de fin

À l'issue de l'exécution :

```bash
# Tous les invariants doivent passer
python3 -m pipeline doctor --severity error
# → 0 violation

# Toutes les refs des SOTAs en sota_cited_confirmed (sauf cas explicites)
python3 -m pipeline status
# → 0 candidate, 0 uid_resolved, 0 awaiting_rtfm_ocr résiduel
# → blocked_human:* et retracted explicites avec raison

# Aucun texte libre de citation dans aucun SOTA
python3 -m pipeline doctor --severity warn | grep "I21\|I22\|I23"
# → 0 ligne
```

## Vérification end-to-end

1. **Test synthétique INGEST** : 3 SOTAs synthétiques (1 wikilinks-only,
   1 texte-libre-only, 1 mixte). Vérifier que post-INGEST :
   - Toutes les citations sont en wikilinks
   - Les refs créées sont dans le registre avec `state=candidate`
   - Le fichier original a été commité avant modification

2. **Test invariants** : `python3 pipeline/tests/test_invariants_synthetic.py`
   → 22/22 OK (19 anciens + I21/I22/I23).

3. **Dry-run sur vault réel** : `pipeline ingest --all --dry-run` →
   liste les citations détectées par SOTA, sans modifier. Revue manuelle
   d'un échantillon de 10 SOTAs.

4. **Apply sur vault réel** : `pipeline ingest --all --apply` →
   commit git auto + extraction + substitution + création refs.

5. **Cascade + validate auto** : `RESEARCH_ENABLE_SHADOW_LIBS=1 pipeline run --loop`
   sur les nouvelles refs candidate.

6. **Audit batch** : `/paper-trail:audit-all` traite désormais toutes
   les SOTAs ingérées (plus seulement 3).

7. **Search** : `pipeline search "beat tracking"` → retourne les refs
   validées sur le sujet.

8. **Hooks** : modifier manuellement une SOTA pour ajouter "Smith et
   al. (2020)" → PostToolUse signale (warning). Tenter de sauver une
   SOTA finalisée avec wikilink vers ref absente → PreToolUse refuse.

## Ce que ce plan NE fait PAS

- Pas de réécriture du worker B (cascade, validation, invariants
  existants restent intacts).
- Pas de modification des skills `sota-writer`, `sota-auditor`,
  `citation-receipts`, `paper-writer` (le pipeline cible les utilise
  tels quels).
- Pas de patch sur les 631 refs validées / 277 retracted / 2 blocked
  existantes (elles sont déjà cohérentes ; INGEST réutilise leurs
  slugs si match).
- Pas de fork ou changement d'architecture macro.
