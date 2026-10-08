---
description: Resolve incomplete textbook references in the registry. Reads candidates via `pipeline resolve-textbooks --list`, invokes the `textbook-resolver` sub-agent to produce a decisions JSON (merge_into / complete / blocked), and applies via `pipeline resolve-textbooks --apply-from`. Fully automated cleanup pass after INGEST.
---

# `/paper-trail:resolve-textbooks` — Automated IA pass on incomplete refs

Nettoie les refs ingérées avec year/title manquant. Process 100%
automatisé, pas de décision humaine ad-hoc.

## Usage

```
/paper-trail:resolve-textbooks                  # dry-run : montre les décisions
/paper-trail:resolve-textbooks --apply          # applique
```

## Ce que fait Claude (workflow strict)

1. **Liste les candidates** :
   ```bash
   python3 -m pipeline resolve-textbooks --list > /tmp/textbook_candidates.json
   ```
   Le JSON contient : slug, author, year, title, state, ingest_source,
   pdf_path, et `siblings` (autres refs du registre avec même lastname,
   pour aider à la fusion).

2. **Invoque le sub-agent `textbook-resolver`** avec le JSON en input :
   ```
   Agent(subagent_type="textbook-resolver",
         prompt="<contenu de /tmp/textbook_candidates.json>")
   ```
   Le sub-agent applique les règles définies dans son contrat (cf.
   `agents/textbook-resolver.md`) :
   - Préfère `merge_into` si un sibling avec PDF correspond
   - Sinon `complete` si textbook canonique reconnu (Sipser, Carton, etc.)
   - Sinon `blocked` (humain tranche)

3. **Sauve le JSON de décisions** retourné par le sub-agent dans
   `/tmp/textbook_decisions.json`.

4. **Mode dry-run** (par défaut) : affiche le résumé des décisions
   (nb par action), demande confirmation avant `--apply`.

5. **Mode `--apply`** :
   ```bash
   python3 -m pipeline resolve-textbooks \
       --apply-from /tmp/textbook_decisions.json
   ```

6. **Récap final** : N merged, N completed, N blocked.

## Garde-fous

- **Sub-agent ne fabrique JAMAIS** une année ou un titre incertain.
  Confidence < 80% → `blocked` (l'utilisateur tranchera via
  `/paper-trail:decide <slug>`).
- **Fusions traçables** : la ref source passe en `retracted` avec
  `retracted_reason: merged_into:<target>`. Réversible via git.
- **Pas de bricolage manuel** : Claude ne construit pas les décisions
  lui-même, il délègue au sub-agent. Process reproductible.

## Quand l'utiliser

- **Après chaque `/paper-trail:ingest <SOTA>`** : nettoie les
  textbooks que l'INGEST a créés sans year/title
- **En batch après `/paper-trail:ingest-all`** : sweep global du
  registre
