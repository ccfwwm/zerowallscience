# Résumé pour reprendre H2-H7 — Robustesse identification INGEST

Ce fichier sert à reprendre le travail dans une nouvelle session après
un reboot ou un autocompact. Plan complet dans
`~/.claude/plans/compressed-painting-squid.md` (plan recentré).

## État actuel

### Pipeline livré et commité

- **INGEST module** (`pipeline/ingest.py`) : extract sections → parse via
  sub-agent → identify DOI → reconcile registry → create refs (avec
  orphan PDF match) → substitute wikilinks
- **CLI** : `pipeline ingest`, `pipeline resolve-textbooks`, `pipeline search`
- **Slash commands** : `/paper-trail:ingest`, `:ingest-all`,
  `:resolve-textbooks`, `:search`
- **Sub-agents** : `citation-parser` (parse SOTA → JSON), `textbook-resolver`
  (decide merge/complete/blocked sur refs `_0000_*` ou `_untitled`)
- **Invariants doctor** : I20 (ref active non citée), I21 (citation texte
  libre non ingérée), I22 (wikilink vers ref absente), I23 (vers retracted)
- **Hooks** : PostToolUse warning, PreToolUse blocking sur SOTAs
- **Optimisations** : RTFM-first dans `_build_pdf_index` (rtfm files), dans
  `_reconcile_with_registry` (rtfm search prefilter), dans `_try_validate_page1`
  (rtfm check + expand au lieu de pdftotext)

### Test pilote D1 (baseline pour mesurer H2-H7)

SOTA : `40_OUTPUT/Papers/P9a_Generation_Recognition_Asymmetry/SOTA_D1_Complexity_per_class.md`

Mesures après tous les fixes commités :
- **Temps : 6m32** (cible H2-H7 : < 2 min)
- **Substitutions : 13 / 28 = 46%** (cible : ≥ 90%)
- **Refs réutilisées (fuzzy merge) : 14**
- **Nouvelles refs créées : 14**
- **Skipped low confidence : 1** (Pratt-Hartmann)

### H1 conclu

paper-search MCP analysé. Verdict : **adopter** comme source DOI
complémentaire dans `_identify_doi`. Apporte 15 sources qu'on n'a pas
(notamment dblp pour computer science). Config dans
`~/dev/musicology-phd/.mcp.json` server `paper-search`.

## Tasks restantes H2-H7

| ID | Tâche | Effort |
|---|---|---|
| #31 | H2 — `_identify_doi` multi-sources + cache LRU | 0.5 |
| #32 | H3 — RTFM daemon ou SQLite direct pour dédup | 1.0 |
| #33 | H4 — Substitution wikilink robuste par ancrage | 0.5 |
| #34 | H5 — Orchestration INGEST → resolve-textbooks auto | 0.5 |
| #35 | H6 — Métriques JSON structurées | 0.25 |
| #36 | H7 — Fixtures de test INGEST | 0.5 |

## Comment reprendre

Dans un nouveau chat, dire :
> Continue le plan robustesse-identification (PIPELINE_CIBLE / compressed-painting-squid.md), à partir de H2. Tasks #31-36. Baseline D1 dans plans/H2_H7_RESUME.md.

Claude doit :
1. Lire `plans/H2_H7_RESUME.md` et `~/.claude/plans/compressed-painting-squid.md`
2. Marquer task #31 en in_progress
3. Attaquer H2 (`_identify_doi` multi-sources via paper-search MCP)

## Règles d'or à respecter

(rappel des memory files existants)

- **Process pas données** : valider le process, jamais bricoler. Toute
  décision IA passe par un sub-agent. Si tenté de patcher manuellement
  → trou du process à corriger.
- **RTFM first** : à chaque fois que c'est possible, RTFM avant tout
  autre outil. Fallback solution standard si RTFM échoue.
- **Sans jargon** : termes du domaine recherche/musicologie, pas de
  noms techniques nus.
- **Procédures non optionnelles** : suivre le plan, signaler les blocages
  humain plutôt que les contourner.

## Fichiers critiques pour H2-H7

- `pipeline/ingest.py` : `_identify_doi`, `_reconcile_with_registry`,
  `_substitute_to_wikilink`, `ingest_citations`
- `pipeline/cli.py` : `cmd_ingest`, `cmd_resolve_textbooks`
- `commands/paper-trail-ingest.md` : orchestration slash command (H5)
- `agents/citation-parser.md`, `agents/textbook-resolver.md` : contrats sub-agents
- `pipeline/tests/test_ingest_fixtures.py` (à créer en H7)

## Outils disponibles pour H2-H7

- `paper-search` MCP (22 plateformes, search uniquement) — pour H2
- `rtfm` CLI + MCP server : `rtfm files`, `rtfm search`, `rtfm check`,
  `rtfm expand` — pour H3
- `rtfm serve` (HTTP daemon, à explorer en H3 pour performance)

## Critères de succès (mesurés sur D1 ré-ingéré)

| Métrique | Baseline | Cible |
|---|---|---|
| Temps total | 6m32 | < 2 min |
| Substitutions / citations | 46% (13/28) | ≥ 90% (26/29) |
| DOI résolus | 11 (par parser) | 18+ (via H2) |
| Décisions IA hors sub-agent | 0 (déjà OK) | 0 |
| Refs `_0000_untitled` après pipeline complet | 7 | 0 (via H5) |
