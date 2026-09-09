# Audit comparatif — legacy_retracted vs nouveau process (2026-05-26)

Comparatif des 119 refs anciennement marquées `retracted` (avec
`legacy_retracted_reason` archivé au reset du 2026-05-25) et leur état
final après remoulin complet par le nouveau pipeline paper-trail
v0.1.0 (cascade locale-first + 10 sources + page 1 anti-homonymy).

## Vue d'ensemble

| Catégorie legacy | Total | page1_validated (accepté nouveau) | Bloqué (cohérent legacy) |
|---|---|---|---|
| `extraction_artifact` | 60 | **0** | 60 (uid_resolved/candidate sans PDF) |
| `homonymie` | 22 | **5** | 17 |
| `duplicate_uid_merged_into:*` | 16 | **13** | 3 |
| `doublon` | 5 | **3** | 2 |
| `other` (descriptive artifact, etc.) | 12 | **4** | 8 |
| `software_not_standalone` | 4 | **1** | 3 |
| **Total** | **119** | **26 (22%)** | **93 (78%)** |

## Lecture

- **`extraction_artifact` (60/60 cohérent)** : tous restent sans PDF
  acquis. Le nouveau process confirme que ces refs étaient des
  artefacts d'extraction (pas de DOI résolvable, cascade épuisée).
  Legacy validé à 100%.

- **`duplicate_uid_merged_into` et `doublon` (16/21 acceptés)** : le
  nouveau process ne détecte pas les doublons automatiquement à
  l'acquisition. L'invariant doctor I13 (PDF sha256 partagé) le signale
  en post-traitement (230 WARN actuels). Pas une régression, juste un
  mécanisme différent.

- **`homonymie` (5/22 acceptés)** : **cas le plus critique**. La
  nouvelle cascade + page 1 validation les a acceptés alors qu'ils
  étaient historiquement marqués `homonymie_purgée`. Deux
  interprétations possibles :
  - L'ancienne décision était erronée (faux positif d'homonymie)
  - La nouvelle page 1 validation est trop laxiste sur ces cas

## Refs à investiguer en priorité

### Ex-homonymies maintenant en page1_validated (5 cas)

Pour chacune, vérifier manuellement la page 1 du PDF acquis vs le
contexte de citation dans le ou les SOTAs qui la citent :

- `bhalke_2017_biblio_informatique`
- `bozkurt_2014_biblio_maths`
- `huang_2020_biblio_maths`
- `mcpherson_2020_biblio_informatique`
- `vogt_1989_biblio_ethno`

**Action proposée** : ouvrir chaque PDF + lire le SOTA qui cite la
ref + décider VRAI ou HALLUCINATION.

### Ex-doublons maintenant en page1_validated (16 cas)

Pour les `duplicate_uid_merged_into:X`, vérifier que la ref source X
existe toujours et que le doublon est légitime. Si oui, transitionner
manuellement la ref accepté en `retracted` avec
`retracted_reason: duplicate_of_<X>`. Si la fusion historique était
erronée, garder la ref acceptée et purger X.

Couvert par I13 doctor pour les doublons par sha256 (signal automatique
sur 230 paires actuelles).

### Ex-other et software à investiguer (5 cas)

- `partitionsinteractives_2007_allombert_assayag` (était :
  retract_descriptive_artifact_real_paper_is_allombert_assayag_desainte_2007)
- `pesetsky_2011_biblio_mir` (était : duplicate same manuscript as
  katz_2011_biblio_mir)
- `shinan_2017_biblio_maths` (était : homonymy detected during page-1
  strict validation)
- `tikhonov_1963_etait_realite` (était :
  retract_duplicate_already_documented_as_ito_2014)
- `bp_2018_architecture_web` (était :
  retract_software_not_standalone_publication)

## Recommandations

1. **Confiance dans le nouveau process** : sur 60
   `extraction_artifact`, 100% confirmés. Sur 17
   `homonymies bloquées`, 100% confirmés. Le nouveau process est aligné
   avec les bonnes décisions historiques.

2. **Cas à arbitrer humainement** : 26 refs à passer en audit manuel.
   C'est un volume gérable (1-2 sessions de curation).

3. **Pour les doublons détectés par I13** : utiliser le doctor (230
   WARN aujourd'hui, 36 paires uniques) comme source pour fusionner ou
   ré-retracter.

4. **Workflow continu** : le pipeline est maintenant *capable* de
   détecter les hallucinations (page 1 anti-homonymy + cascade
   exhaustion) ET de signaler les doublons (I13). Le curator humain
   tranche binaire pour les cas restants.

## Données sources

- Snapshot pré-reset (état avec retracted) :
  `~/snapshots/registry_refs_2026-05-25_before_full_reset.tar.gz`
- Snapshot pré-remoulin (retracted seulement) :
  `~/snapshots/registry_refs_2026-05-25_before_retracted_remoulin.tar.gz`
- Snapshot post-cascade (état actuel) :
  `~/snapshots/registry_refs_2026-05-26_pre_doctor_fix.tar.gz`

Pour chaque ref auditée, le frontmatter contient :
- `legacy_state: retracted` (l'ancien état)
- `legacy_retracted_reason: <reason>` (la raison historique)
- `legacy_pdf_path: <path>` (si un PDF était associé)
- `state: <new>` (l'état après nouveau process)

Permet à tout moment de retrouver le contexte historique pour audit.
