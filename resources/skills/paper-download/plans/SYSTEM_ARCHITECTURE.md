# Architecture système — pipeline anti-hallucination doctoral

> Doc d'archi globale. Le worker B (ce repo) n'est qu'un maillon. Ici on
> regarde tout le système : création de SOTAs, validation d'articles
> existants, consolidation de la base. Et on identifie ce qui manque.

---

## 0. But

Garantir, mécaniquement, que **toute citation dans un SOTA ou un article
de thèse correspond à une vraie référence, identifiée correctement, dont
le PDF est sur disque**. Bloquer les hallucinations à la source, signaler
celles déjà introduites, consolider une base de connaissances propre.

Origine : P9α v1 (2026-02) retiré pour 12 erreurs biblio dont un quote
fabriqué. Cause racine : citations écrites « de mémoire ».

---

## 1. Vue d'ensemble du système cible

```mermaid
flowchart TB
    subgraph IN["ENTRÉES"]
        A["Cas A :<br/>tu demandes un nouveau SOTA<br/>sur sujet X"]
        B["Cas B :<br/>tu veux valider un SOTA ou<br/>article existant"]
    end

    subgraph ORCH["ORCHESTRATEURS (skills Claude Code)"]
        SW["sota-writer skill<br/>propose refs candidates<br/>(MANQUANT)"]
        SA["audit-sotas tool<br/>scanne SOTAs existants<br/>(MANQUANT)"]
        WA["warn-articles tool<br/>ajoute warnings LaTeX/MD<br/>(MANQUANT)"]
    end

    subgraph CORE["COEUR — base bibliographique"]
        REG[("Registre YAML<br/>_registry/refs/*.md")]
        W["Worker B CLI<br/>(ce repo)<br/>FSM 8 états + cascade 10 niveaux"]
        SC["source-collector skill<br/>variante interactive"]
        D["pipeline doctor<br/>19 invariants"]
    end

    subgraph TOOLS["BOÎTE À OUTILS (acquisition + vérif)"]
        PS["paper-search MCP<br/>(MANQUANT)<br/>22 plateformes"]
        FR["fetch_paper_refs.py<br/>batch BibTeX→S2"]
        VC["verify_claims.py<br/>(spécifique P9α aujourd'hui)"]
        IS["import_asymetry_sotas.py<br/>scan SOTA→crée refs"]
    end

    subgraph OUT["SORTIES"]
        S1["SOTA propre<br/>0 ref hallucinée<br/>tous PDFs locaux"]
        S2["Article avec warnings<br/>refs douteuses signalées"]
        S3["Base consolidée<br/>réutilisable cross-papier"]
    end

    A --> SW --> PS --> REG
    SW --> FR --> REG
    B --> SA --> REG
    B --> IS --> REG
    REG <--> W
    REG <--> SC
    REG --> D
    D --> SA
    REG --> VC
    SA --> S1
    WA --> S2
    REG --> S3

    style SW fill:#f8d7da,stroke:#dc3545
    style SA fill:#f8d7da,stroke:#dc3545
    style WA fill:#f8d7da,stroke:#dc3545
    style PS fill:#f8d7da,stroke:#dc3545
    style W fill:#d4edda
    style SC fill:#d4edda
    style D fill:#d4edda
    style FR fill:#d4edda
    style VC fill:#fff3cd
    style IS fill:#d4edda
```

Légende : **vert** = existe et fonctionne, **jaune** = existe partiellement,
**rouge** = manque ou désactivé.

---

## 2. Inventaire des composants

| Composant | Statut | Rôle | Localisation |
|---|---|---|---|
| Registre YAML | ✅ | 909 refs en `_registry/refs/*.md` | `/mnt/d/.../10_SOURCES/_registry/` |
| Worker B CLI | ✅ | FSM + cascade, batch automatisé | ce repo |
| pipeline doctor | ✅ | 19 invariants, vérif cohérence | ce repo |
| `source-collector` skill | ✅ | Variante interactive worker B | `~/.claude/plugins/source-collector/` |
| `fetch_paper_refs.py` | ✅ | Batch BibTeX→Semantic Scholar→PDFs | `musicology-phd/scripts/` |
| `import_asymetry_sotas.py` | ✅ | Scan SOTA→extrait `[[slug]]`→crée refs | `_registry/tools/` |
| `verify_claims.py` | ⚠️ | Vérif claim↔PDF, **hardcodé pour P9α** | `musicology-phd/scripts/` |
| `paper-search` MCP | ❌ | Recherche unifiée 22 plateformes | référencé dans `source-collector/SKILL.md` mais absent de `mcp.json` |
| `sota-writer` skill | ❌ | Orchestre création complète d'un SOTA | **À CRÉER** |
| `sota-curator` skill | ❌ | Confirme citations, drive `sota_cited_confirmed` | **À CRÉER** |
| `audit-sotas` tool | ❌ | Audite tous SOTAs existants, purge refs hallucinées | **À CRÉER** |
| `warn-articles` tool | ❌ | Insère warnings dans LaTeX/MD pour refs douteuses | **À CRÉER** |

---

## 3. Cas A — Créer un nouveau SOTA "non halluciné"

### Ce que tu veux

> « Je demande au skill de me créer un SOTA sur un sujet ; il faut qu'il
> ait tous les outils sous la main pour me garantir qu'à la fin j'ai un
> SOTA avec 0 ref hallucinées et toutes bien identifiées et téléchargées
> en local. »

### Flux cible

```mermaid
flowchart LR
    U([Toi :<br/>« SOTA sur X »]) --> SW[sota-writer skill]
    SW -->|1. recherche| PS[paper-search MCP<br/>arXiv, S2, OpenAlex…]
    SW -->|2. propose<br/>liste candidates| REVIEW{Toi : valides<br/>quels candidats ?}
    REVIEW -->|N refs gardées| CREATE[Crée N entries<br/>_registry/refs/*.md<br/>state=candidate]
    CREATE --> WB[Worker B<br/>pipeline run]
    WB -->|page1_validated| OK[refs valides<br/>PDF local OK]
    WB -->|cascade_exhausted| KO1[blocked_human<br/>signalé]
    WB -->|homonymie| KO2[retracted<br/>hallucination écartée]
    OK --> WRITE[sota-writer rédige<br/>SOTA en utilisant<br/>uniquement les valides]
    KO1 --> WARN1[liste les inaccessibles]
    KO2 --> WARN2[liste les hallucinations]
    WRITE --> FINAL[SOTA final<br/>0 ref hallucinée<br/>tout en local]
    WARN1 --> FINAL
    WARN2 --> FINAL
```

### Gaps actuels

1. **`paper-search` MCP** : référencé dans `source-collector/SKILL.md`
   (`mcp__paper-search__search_openalex`, etc.) mais pas dans
   `mcp.json`. Sans lui, `sota-writer` ne peut pas faire la recherche
   multi-plateforme unifiée. **À réactiver / réinstaller.**
2. **`sota-writer` skill** : n'existe pas. C'est l'orchestrateur qui
   doit : (a) lancer la recherche, (b) proposer les candidates,
   (c) déclencher le worker, (d) rédiger le SOTA en respectant le résultat.
   **À créer.**
3. Boucle de proposition humain-in-the-loop : où l'humain accepte/refuse
   chaque candidate avant qu'elle entre dans le pipeline. **À designer.**

### Composants réutilisables

- Worker B : prêt à recevoir des refs en `candidate`
- `fetch_paper_refs.py` : déjà fonctionnel pour batch — peut servir de
  base au sota-writer si l'orchestration reste simple
- `source-collector` skill : déjà capable de driver la FSM en mode
  interactif (donc utilisable comme sous-couche de `sota-writer`)

---

## 4. Cas B — Valider un SOTA / article existant

### Ce que tu veux

> « Pour tous les SOTAs existants, articles en cours de rédaction ou déjà
> rédigés, il faut que toutes les refs soient vérifiées comme non
> hallucinées et citations confirmées sinon, on doit remonter des alertes :
> les SOTAs doivent être purgés des refs hallucinées, pour les articles,
> des warnings explicites doivent être ajoutés. Idem pour référence réelle
> mais non téléchargeable. Dans tous les cas on doit consolider la base. »

### Flux cible

```mermaid
flowchart TB
    INPUT[SOTA existant<br/>ou article<br/>LaTeX/Markdown] --> SCAN[audit-sotas tool<br/>extrait toutes les refs]
    SCAN --> CHECK{ref dans registre ?}
    CHECK -->|non| MISSING[crée ref candidate<br/>via import_asymetry_sotas]
    CHECK -->|oui| STATE{state ?}
    MISSING --> STATE
    STATE -->|candidate, uid_resolved,<br/>pdf_acquired| RUN[déclenche Worker B<br/>sur ces refs]
    STATE -->|page1_validated| VC[verify_claims :<br/>citation correspond-elle<br/>à un vrai passage ?]
    STATE -->|sota_cited_confirmed| GOOD[OK rien à faire]
    STATE -->|retracted| HALLUC[ref hallucinée détectée]
    STATE -->|blocked_human:*| INACC[ref inaccessible]
    RUN --> STATE
    VC -->|claim trouvé| GOOD
    VC -->|claim absent| FABRIC[citation fabriquée]
    HALLUC --> ACT1{type de fichier ?}
    FABRIC --> ACT1
    INACC --> ACT2{type de fichier ?}
    ACT1 -->|SOTA| PURGE[purge la ref<br/>du SOTA]
    ACT1 -->|article| WARN[warn-articles<br/>insère warning explicite]
    ACT2 -->|SOTA| PURGE
    ACT2 -->|article| WARN
    GOOD --> CONSO[base consolidée]
    PURGE --> CONSO
    WARN --> CONSO
```

### Gaps actuels

1. **`audit-sotas` tool** : n'existe pas. Doit scanner *tous* les SOTAs
   du vault et croiser avec le registre. `import_asymetry_sotas.py`
   couvre une partie (extraction des wikilinks) mais ne fait pas
   l'audit complet ni la purge.
2. **`verify_claims.py` généralisé** : aujourd'hui hardcodé pour
   `Paper9alpha_v1.tex`. Doit devenir générique (paramétrable par
   chemin LaTeX/MD, par projet).
3. **`warn-articles` tool** : n'existe pas. Doit savoir ouvrir un
   LaTeX ou Markdown, repérer la position d'une citation, insérer un
   warning visible (commentaire LaTeX, callout Obsidian, etc.).
4. **Définition de "ref hallucinée" automatique** : aujourd'hui c'est
   `state == "retracted"`. Mais une ref `blocked_human:title_mismatch`
   après cascade exhaustive est-elle « hallucinée » ou « inaccessible » ?
   Règle à formaliser.

---

## 5. Le worker B en détail

Voir `pipeline/ARCHITECTURE.md` (FSM 8 états, cascade 10 sources,
19 invariants). C'est l'organe qui fait avancer une ref de `candidate`
à `sota_cited_confirmed`. Il est **complet et opérationnel**.

---

## 6. Roadmap pour combler les gaps

### Priorité 1 — Bouclage de l'existant

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | Vérifier où est passé `paper-search` MCP, le réinstaller ou installer un équivalent | 30 min | débloque Cas A |
| 2 | Lancer `pipeline run --state candidate` sur les 240 candidates actuelles | 16-48 min | nettoie l'existant |
| 3 | Auditer les 504 I8 (`state_history` non monotone) — bug ou migration ? | 1-2h | clarifie le drift résiduel |

### Priorité 2 — Construire `sota-writer` (Cas A)

| # | Action | Effort | Impact |
|---|---|---|---|
| 4 | Spécifier le skill `sota-writer` : entrée=sujet, sortie=SOTA + refs en `sota_cited_confirmed` | 1 session design | base contract |
| 5 | Implémenter MVP : utilise `paper-search` MCP + worker B + humain-in-the-loop pour valider candidates | 2-3 sessions | débloque le Cas A complet |

### Priorité 3 — Construire l'audit (Cas B)

| # | Action | Effort | Impact |
|---|---|---|---|
| 6 | Généraliser `verify_claims.py` (paramétrable par fichier source) | 1 session | base de Cas B |
| 7 | Créer `audit-sotas` tool : scanne tous SOTAs, classe les refs (OK / hallucinée / inaccessible / non vérifiée) | 1-2 sessions | rapport global |
| 8 | Créer `warn-articles` tool : insère warnings dans LaTeX/Markdown | 1 session | finalise Cas B |

### Priorité 4 — Sota-curator (boucle SOTA↔refs)

Cf. `plans/plan-design.md` §4. Le worker B expose déjà
`pipeline events` (Couche 3) qui liste les refs récemment validées et
leur SOTA destinataire. Reste à brancher un skill curator qui
consomme cette liste et déclenche la confirmation sémantique.

---

## 7. Décisions à prendre (humain)

1. **`paper-search` MCP** : on le réinstalle, ou on en choisit un autre
   (ex. MCPs `paper-search-mcp`, `scholar-mcp`, ou implementation maison
   via `requests` sur OpenAlex+S2+arXiv) ?
2. **Granularité Cas A** : skill `sota-writer` autonome (qui écrit le
   markdown lui-même) ou semi-auto (te propose juste les refs, tu écris
   le SOTA) ?
3. **Warnings article** : format exact attendu — commentaire LaTeX
   `\todo{}`, callout Obsidian `> [!warning]`, fichier `.warnings.md`
   séparé ?

Une fois ces 3 décisions prises, les priorités 2-3 deviennent
implémentables sans ambiguïté.
