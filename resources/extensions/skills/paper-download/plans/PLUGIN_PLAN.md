# Plugin Claude Code — `research-anti-hallucination`

> Plan détaillé v3 — **construction propre** (option D). Un seul repo,
> licence MIT (libre), workflow scientifique générique publishable, AA
> et Sci-Hub en opt-in strict avec disclaimer.
>
> Le repo actuel devient le plugin. Le worker B reste comme moteur
> d'acquisition. On s'inspire des patterns des plugins existants sans
> en forker aucun (lecture du code, ré-implémentation avec attribution
> dans NOTICE.md si reprise textuelle d'un snippet sous licence).

---

## 1. Vision en 1 phrase

Plugin Claude Code anti-hallucination **générique** pour la recherche
scientifique : crée des SOTAs/revues garantis sans fabrication, audite
les SOTAs/articles existants (purge ou warnings), avec un moteur de
validation strict (FSM 8 états + cascade DL + page 1 anti-homonymie +
19 invariants doctor) qui ferme mécaniquement la porte aux citations
hallucinées.

Domaine d'usage : recherche académique tous champs, avec attention
particulière aux refs paywall (sciences exactes, médecine, sciences
humaines/sociales). Spécifiquement testé sur musicologie computationnelle.

---

## 2. Stratégie — option D appliquée

**On construit propre**. On ne fork rien. On s'inspire des patterns
des plugins existants identifiés à l'inventaire (cf. §3 ci-dessous).
Quand un snippet de code est repris textuellement sous une licence
permissive (MIT), on l'attribue dans `NOTICE.md`. Tout le reste est
notre code (licence MIT).

**Pourquoi pas fork** :
- Aucun plugin existant ne couvre l'ensemble (cf. inventaire §3)
- 60% du code existe déjà chez nous (worker B + helpers `lib/`)
- Architecture sur mesure pour notre workflow (Obsidian + LaTeX +
  registre YAML + RTFM)
- Liberté de licence (MIT, pas de contamination CC BY-NC)
- Code 100% maîtrisé (pas de baggage hérité à debugger)

**Trajectoire** : D peut évoluer vers B (fork ARS) plus tard si besoin
réel ; l'inverse est plus dur.

---

## 3. Sources d'inspiration (lecture seule, pas de fork)

| Source | Licence | Ce qu'on en prend (concept, pas code sauf mention) |
|---|---|---|
| `Imbad0202/academic-research-skills` (ARS) v3.9.4 | CC BY-NC 4.0 | Concept du pipeline 10-stages writing/review (à reproduire plus tard si besoin V2). Idée des audit anchors 3-niveaux. **Pas de copie de code** (incompatible MIT). |
| `Agents365-ai/paper-fetch` v0.5.0 | MIT | Format de sortie JSON stable, nommage de fichier `{author}_{year}_{title}.pdf`, exit codes typés. **Copie possible de patterns Python** (attribution dans NOTICE). |
| `fcakyon/phd-skills` v1.3.0 | MIT | Pattern des 11 hooks d'intégrité, `/factcheck` contre DBLP. **Copie possible** (attribution). |
| `JamesWeatherhead/receipts` | MIT | Pattern audit local PDF↔claim, format `RECEIPTS.md` structuré (verdict VALID/ADJUST/INVALID). **Concept seulement** (le code est en JS, on ré-implémente Python). |
| `Psypeal/claude-knowledge-vault` v2.4.0 | MIT | YAML frontmatter Obsidian, Sci-Hub opt-in pattern, `.vault/raw/<slug>.md` pour audit. **Concept**. |
| `delibae/claude-prism` v1.1.6 | MIT | Approche offline-first, intégrations Zotero. **Idées sur Zotero plus tard**. |
| Notre `source-collector` (lib local) | non licencié → MIT | Cascade 10 niveaux, page 1 validation. **Code intégré dans le plugin** (réutilisation directe, c'est à nous). |
| Notre `pipeline/` (worker B) | non licencié → MIT | FSM + invariants + RTFM. **Code central du plugin**. |

---

## 4. Structure du repo cible

```
paper-trail/                                 ← repo actuel
│
├── LICENSE                                  # MIT (à créer)
├── NOTICE.md                                # NOUVEAU — attributions
├── README.md                                # RÉÉCRIT — décrit le plugin
├── CHANGELOG.md                             # NOUVEAU
├── DISCLAIMER.md                            # NOUVEAU — shadow libraries
│
├── .claude-plugin/
│   ├── plugin.json                          # NOUVEAU — manifest
│   └── marketplace.json                     # NOUVEAU (si publication marketplace)
│
├── skills/                                  # NOUVEAU (4-5 skills, ciblées)
│   ├── pdf-cascade/
│   │   └── SKILL.md                         # cascade DL + page 1 validation
│   ├── registry-doctor/
│   │   └── SKILL.md                         # invariants I1-I19 + auto-fix
│   ├── sota-writer/
│   │   └── SKILL.md                         # cas A : créer un SOTA non halluciné
│   ├── sota-auditor/
│   │   └── SKILL.md                         # cas B : auditer SOTA/article
│   └── citation-receipts/
│       └── SKILL.md                         # audit local PDF↔claim
│
├── commands/                                # NOUVEAU (6-8 commands)
│   ├── research-new-sota.md                 # cas A
│   ├── research-audit-sota.md               # cas B partie SOTA
│   ├── research-audit-article.md            # cas B partie article (+ --warn)
│   ├── research-cascade.md                  # cascade DL sur 1 ref ou batch
│   ├── research-doctor.md                   # invariants
│   ├── research-status.md                   # état registre
│   ├── research-receipts.md                 # audit local
│   └── research-reactivate-ocr.md           # reprise OCR
│
├── agents/                                  # NOUVEAU (3-4 subagents)
│   ├── researcher.md                        # recherche multi-source
│   ├── cascade-runner.md                    # exécute la cascade pour 1 ref
│   ├── page1-validator.md                   # anti-homonymie
│   └── claim-checker.md                     # audit local PDF↔claim
│
├── hooks/                                   # NOUVEAU — intégrité
│   └── hooks.json                           # PostToolUse, PreToolUse, SessionEnd
│
├── pipeline/                                # EXISTE — worker B inchangé
│   ├── cli.py, doctor.py, invariants.py, …
│
├── lib/                                     # EXISTE (helpers) + ajouts
│   ├── oa_finder.py, s2_resolver.py, …
│   └── shadow/                              # NOUVEAU — AA + Sci-Hub isolés
│       ├── annas_archive.py                 # opt-in via env var
│       ├── scihub.py                        # opt-in via env var
│       └── README.md                        # disclaimer dédié
│
├── tools/                                   # EXISTE
│   └── reinject_legacy_blocked.py
│
├── plans/                                   # EXISTE (docs design)
│   ├── plan-design.md
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── PLUGIN_PLAN.md                       # CE FICHIER
│   └── B_worker_FSM_pipeline.md
│
└── docs/                                    # NOUVEAU
    ├── USAGE.md                             # utilisation quotidienne
    ├── ARCHITECTURE.md                      # design du plugin
    └── LEGAL.md                             # détaillé shadow libs
```

---

## 5. Skills — contrats compacts

Chaque skill = un `SKILL.md` avec frontmatter YAML
(`name`, `description`, triggers) + instructions Claude.

### 5.1 `pdf-cascade`

**Trigger** : « télécharger ce PDF », « cascade », « acquérir source »,
« download ref », `/research:cascade`.

**Entrée** : ref slug ou métadonnées (title, author, year, DOI/arXiv).
**Sortie** : PDF local + state ∈ {`page1_validated`, `awaiting_rtfm_ocr`,
`blocked_human:*`, `retracted`}.

**Réutilise** : `pipeline.cascade.run_cascade()`, `pipeline.transitions.*`,
`lib/oa_finder.py`, `lib/s2_resolver.py`, `lib/archive_org_helper.py`,
optionnellement `lib/shadow/annas_archive.py` et `lib/shadow/scihub.py`.

**Garde-fou intégré** : page 1 validation anti-homonymie obligatoire
avant `success` (réutilisé du source-collector).

### 5.2 `registry-doctor`

**Trigger** : « audit registre », « invariants », `/research:doctor`.

**Entrée** : (optionnel) `--fix`, `--correlate-rtfm`, `--check-sha`,
`--severity X`.
**Sortie** : rapport markdown des 19 invariants I1-I19 + nombre d'auto-fixés.

**Wrappe** : `pipeline doctor` CLI existant.

### 5.3 `sota-writer` (cas A)

**Trigger** : « écris un SOTA sur X », « rédige une revue sur Y »,
`/research:new-sota <sujet>`.

**Entrée** : sujet (texte libre), optionnel : domaine, profondeur.
**Sortie** : `SOTA_<topic>.md` au bon emplacement, uniquement avec refs
en `page1_validated` ou `sota_cited_confirmed`. + rapport des refs
écartées (cascade_exhausted, retracted).

**Flux interne** :
1. Sub-agent `researcher` → liste de candidates depuis sources légales
   (Crossref, S2, OpenAlex, arXiv, HAL — pas de shadow par défaut)
2. Validation humain-in-the-loop (Claude propose, utilisateur accepte)
3. Crée refs `state=candidate` dans le registre
4. Invoque `pdf-cascade` pour chacune
5. Agrège : OK / blocked / retracted
6. Rédige le SOTA en citant uniquement les refs validées
7. Liste séparée « Refs écartées » avec raisons

**Garde-fou** : refuse si > 30% candidates échouent (signal sujet flou
ou cascade en panne).

### 5.4 `sota-auditor` (cas B partie SOTA)

**Trigger** : « audite ce SOTA », `/research:audit-sota`.

**Entrée** : chemin SOTA ou glob.
**Sortie** : rapport classifiant chaque ref citée :
- OK (`sota_cited_confirmed`)
- À VALIDER (`page1_validated` mais pas confirmé sémantique)
- INACCESSIBLE (cascade_exhausted)
- HALLUCINÉE (`retracted` ou `blocked_human:title_mismatch` confidence haute)
- INCONNUE (wikilink vers ref absente du registre)

**Option `--purge`** : retire les wikilinks HALLUCINÉE du SOTA, ajoute
note de bas listant ce qui a été retiré + raison.

### 5.5 `citation-receipts` (cas B partie article, inspiré receipts)

**Trigger** : « vérifie cet article », « audit citations »,
`/research:audit-article <path>`.

**Entrée** : fichier LaTeX (`.tex`) ou Markdown.
**Sortie** : `RECEIPTS.md` avec verdict par citation
(VALID / ADJUST / INVALID + raison + correction suggérée), inspiré
du format `receipts` (re-impl Python).

**Option `--warn`** : insère commentaires LaTeX `\todo{}` rouges OU
callouts Obsidian `> [!warning]` à côté des citations problématiques,
dans une copie `.bak` du fichier original.

**Différence avec ARS audit anchors** : on vérifie sur **PDF complet**
(pas extraits 25 mots) → catch des claims plus subtils.

---

## 6. Commands — mapping complet

| Commande | Skill | Args principaux |
|---|---|---|
| `/research:new-sota` | `sota-writer` | `<sujet>` |
| `/research:audit-sota` | `sota-auditor` | `<path-or-glob>` `[--purge]` |
| `/research:audit-article` | `citation-receipts` | `<path>` `[--warn]` |
| `/research:cascade` | `pdf-cascade` | `<slug>` ou `--state X` `[--limit N]` |
| `/research:doctor` | `registry-doctor` | `[--fix] [--correlate-rtfm] [--check-sha]` |
| `/research:status` | (wrapper) | (aucun) |
| `/research:receipts` | `citation-receipts` | `<path>` |
| `/research:reactivate-ocr` | `pdf-cascade` (mode OCR) | (aucun) |

---

## 7. Agents (subagents)

3-4 subagents pour parallélisation et isolation de contexte.

| Agent | Rôle | Outils principaux |
|---|---|---|
| `researcher` | Liste de candidates depuis sources légales | WebFetch, Bash (helpers `lib/`) |
| `cascade-runner` | Exécute cascade DL pour 1 ref (toutes sources sauf shadow par défaut) | Bash (worker B), Read |
| `page1-validator` | Anti-homonymie : ouvre page 1, compare auteur/titre/keywords | Bash (pdftotext), Read |
| `claim-checker` | Audit local : claim ↔ PDF (style receipts) | Read PDF, Grep, Bash |

---

## 8. Hooks (inspirés phd-skills, MIT, attribution)

`hooks/hooks.json` configure :

- **PostToolUse(Write|Edit)** sur `_registry/refs/*.md` :
  → invoque `pipeline doctor` sur la ref modifiée (mini-check immédiat)
- **PreToolUse(Write)** sur un SOTA :
  → refuse si certains wikilinks pointent vers refs non
  `sota_cited_confirmed` (force passage par `/research:audit-sota`)
- **SessionEnd** :
  → `pipeline doctor --severity error` rapport synthétique (skip via
  flag env `RESEARCH_SKIP_END_DOCTOR=1`)

**Pattern** repris de phd-skills (hooks d'intégrité auto-trigger sur
`.tex`/`.bib`). Attribution dans NOTICE.

---

## 9. AA / Sci-Hub — opt-in strict

### 9.1 Comportement par défaut

**Désactivé**. La cascade s'arrête à WebSearch queue (source 10 non-shadow)
si AA et Sci-Hub ne sont pas explicitement activés. Pour les refs paywall
sans alternative OA, l'état devient `blocked_human:cascade_exhausted` →
décision humaine.

### 9.2 Activation

Via variable d'environnement explicite :

```bash
export RESEARCH_ENABLE_SHADOW_LIBS=1   # active AA + Sci-Hub dans la cascade
```

OU flag CLI :

```bash
python -m pipeline run --enable-shadow-libs
```

Au runtime, si activé :
- Premier appel = affichage d'un disclaimer dans stderr
- Log explicite dans `acquisition_attempts[].via` : `annas_archive_optin`
  / `scihub_optin` (traçabilité auditive)

### 9.3 Isolation du code

- `lib/shadow/` est un sous-module dédié contenant `annas_archive.py`
  et `scihub.py`
- Le code de la cascade principale a un `if` explicite qui skip ces
  sources si la variable n'est pas set
- `lib/shadow/README.md` contient un disclaimer dédié

### 9.4 DISCLAIMER.md (extrait)

> **Shadow libraries (Anna's Archive, Sci-Hub)**
>
> Ces sources sont **désactivées par défaut**. Leur activation est de
> votre seule responsabilité.
>
> L'accès au contenu de ces services peut violer le droit d'auteur dans
> votre juridiction. Vous confirmez avoir le droit légal d'accéder au
> matériel téléchargé (fair use, droit de citation, accès institutionnel,
> ouvrages dans le domaine public, etc.).
>
> Ce plugin n'héberge aucun contenu protégé. Il agit uniquement comme un
> client requêtant les services publics distants.
>
> Pour activer : `export RESEARCH_ENABLE_SHADOW_LIBS=1`. Pour désactiver
> définitivement : ne définissez pas cette variable. Aucune activation
> automatique.

### 9.5 README

Section dédiée « Shadow libraries (opt-in) » en bas du README, après
toutes les autres features. Pas en avant.

---

## 10. Workflow scientifique générique (pas musicologie-spécifique)

Le plugin est conçu pour la recherche académique **tous champs**.
Pour rester générique :

- **Pas de chemins hardcodés** dans le code des skills (utilise variables
  d'env `RESEARCH_VAULT_PATH`, `RESEARCH_SOURCES_PATH` avec valeurs par
  défaut sensées)
- **Pas de présomption** sur l'organisation du vault (l'utilisateur
  configure son adapter via `RESEARCH_VAULT_LAYOUT=obsidian|zotero|flat`)
- **Pas de noms spécifiques au projet** dans les exemples (le README
  donne des exemples génériques : *Computer Science papers*, *Medical
  reviews*, etc.)
- **Tests synthétiques** indépendants du vault réel

Pour notre usage personnel (musicologie) :
- Fichier `.research/config.yml` local (gitignored) qui surcharge les
  chemins par défaut → `VAULT=/mnt/d/Obsidian/.../Ontologie musicale`
- Les SOTAs co-localisés sous `10_SOURCES/<biblio>/` deviennent un cas
  particulier supporté par l'adapter Obsidian générique

---

## 11. Roadmap par phases

### Phase P0 — Structure plugin (1 session)

- `LICENSE` (MIT)
- `NOTICE.md` (attributions sources d'inspiration)
- `DISCLAIMER.md` (shadow libs)
- `.claude-plugin/plugin.json` (manifest)
- `README.md` réécrit (focus plugin, pas worker seul)
- Squelettes vides : `skills/`, `commands/`, `agents/`, `hooks/`, `docs/`
- Test : `/plugin install file://...` réussit, `/research:status` répond
  (déjà câblé sur CLI worker existant)

**Critère** : le plugin s'installe, status fonctionne.

### Phase P1 — Skills core (2-3 sessions)

- `skills/pdf-cascade/SKILL.md` (utilise pipeline existant + AA opt-in)
- `skills/registry-doctor/SKILL.md` (wrapper invariants)
- `commands/research-cascade.md`, `research-doctor.md`,
  `research-status.md`, `research-reactivate-ocr.md`
- `agents/cascade-runner.md`, `page1-validator.md`
- `hooks/hooks.json` (PostToolUse refs + SessionEnd doctor)
- Refactor cascade : ajout du check `RESEARCH_ENABLE_SHADOW_LIBS`
- Tests E2E sur 5 refs `candidate` du registre

**Critère** : `/research:cascade <slug>` télécharge + valide page 1.
`/research:doctor` produit le rapport. Hooks actifs.

### Phase P2 — Cas A : sota-writer (3-4 sessions)

- `skills/sota-writer/SKILL.md`
- `commands/research-new-sota.md`
- `agents/researcher.md`
- Workflow humain-in-the-loop pour validation candidates
- Test E2E : `/research:new-sota "test topic"` produit un mini-SOTA
  avec 3-5 refs validées

**Critère** : 0 ref hallucinée dans le SOTA produit, refs écartées
listées séparément.

### Phase P3 — Cas B : audit + receipts (2-3 sessions)

- `skills/sota-auditor/SKILL.md`
- `skills/citation-receipts/SKILL.md`
- `agents/claim-checker.md`
- `commands/research-audit-sota.md`, `research-audit-article.md`,
  `research-receipts.md`
- Ré-implémentation Python du pattern receipts
- Tests : audit d'un SOTA existant + audit d'un article LaTeX réel

**Critère** : `RECEIPTS.md` produit + option `--warn` fonctionnelle
en LaTeX et Markdown.

### Phase P4 — Polish + publication (1-2 sessions)

- `docs/USAGE.md`, `ARCHITECTURE.md`, `LEGAL.md` finalisés
- `marketplace.json` si publication
- CHANGELOG v0.1.0
- Tests d'intégration croisés
- (optionnel) Soumission au marketplace Anthropic community

**Critère** : plugin installable propre, doc complète, prêt à
partager publiquement.

---

## 12. Décisions humaines restantes

1. **Nom final du plugin** : `research-anti-hallucination` (long, clair)
   / `research-rigor` (court) / `cite-truth` (slogan) / autre ?
2. **Rename du repo GitHub** : `references-consolidation` →
   `<nom-plugin>` ? GitHub fait redirection auto ~30 jours.
3. **Publication marketplace** : Anthropic community marketplace dès
   v0.1.0 ou attendre v1.0 ?
4. **Adapter par défaut** : `obsidian` (notre cas) / `flat` (plat) /
   `zotero` (intégration Zotero) ? Quoi mettre en exemple dans le README ?
5. **Pipeline writing auto** (cas A complet à la ARS) : MVP (V0.1) ou
   plus tard (V1.0) ? Si MVP : on s'inspire d'ARS sans copier, et on
   construit une version réduite.

---

## 13. Hors-scope V1 (explicite)

- MCP server custom (`paper-search`, `registry`) — reste CLI Python
- Réécriture intégrale du worker B en agents Claude (le CLI reste)
- Pipeline writing à la ARS complet (10-stages, audit anchors, Material
  Passport) — peut venir en V2 si demandé
- Intégration Zotero/Mendeley directe (sera dans `pdf-cascade` plus tard)
- UI graphique
- Sync registre multi-machines (versionnement git du registre est hors
  scope du plugin)
- Anna's Archive activé par défaut (toujours opt-in strict)
