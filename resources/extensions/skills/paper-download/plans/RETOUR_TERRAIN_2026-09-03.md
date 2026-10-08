# Retour de terrain — corpus binaural, mai → septembre 2026

*Rédigé le 3 septembre 2026, après quatre mois d'usage continu sur un corpus
réel : **316 fiches, 273 documents vérifiés, 16 états de l'art**. C'est, à ma
connaissance, la première validation du greffon hors du corpus de son auteur.*

Ce document rassemble ce qui a cassé, ce qui a manqué, et ce qui a bien marché.
Il ne propose pas de correctifs : il décrit des symptômes reproductibles.

---

## 1. Défauts reproductibles

### 1.1 Fiche YAML invalide → panne silencieuse puis plantage

**Le symptôme le plus coûteux du dossier.** `load_ref` rend `None` sans rien
dire ; l'outil appelant plante plus loin sur un attribut :

```
AttributeError: 'NoneType' object has no attribute 'frontmatter'
  libgen_download.py:106  if ref.frontmatter.get(k) is None:
```

Ou bien, dans les outils que j'ai depuis endurcis, la fiche est simplement
sautée avec `fiche_illisible` — et la référence disparaît des acquisitions sans
que personne ne s'en aperçoive. J'ai perdu deux passages complets sur ce motif.

**Trois causes distinctes rencontrées, toutes à l'écriture de la fiche :**

| Cause | Exemple réel |
|---|---|
| Deux-points non échappé dans un scalaire nu | `venue: Psychiatry Research: Neuroimaging` — et `title: Effect of ... Quality of Life: A Randomized Clinical Trial` |
| Élément de liste orphelin après une liste vide | une puce écrite juste après `rejected_sha256: []` |
| Apostrophe dans un scalaire entre quotes simples | `annee_incertaine: 'la bibliographie s'arrête à 2013'` |

**Ce qui aiderait** : valider le YAML **à l'écriture** et refuser ; et quand la
lecture échoue, dire le *slug* et l'erreur d'analyse plutôt que de rendre `None`.
Accessoirement, mettre systématiquement `title` et `venue` entre guillemets
doubles à l'écriture supprimerait deux causes sur trois.

### 1.2 Titres Crossref porteurs de balises et de sauts de ligne

Un titre reçu tel quel :

```yaml
title: "The Medicine Dance of the\n                    <i>!</i>\n                    Kung Bushmen"
```

a produit un **nom de fichier contenant un saut de ligne littéral**, ce qui casse
tous les outils en ligne de commande qui manipulent le coffre. Il a fallu le
repérer à la main.

**Ce qui aiderait** : à l'ingestion d'un titre, retirer le balisage (JATS/HTML)
et réduire les blancs ; puis assainir le nom de fichier dérivé. J'ai vérifié au
parseur : c'était le seul cas sur 316 fiches, mais il a suffi.

### 1.3 La validation page 1 ne détecte pas le mauvais document

**C'est la difficulté centrale de tout le projet.** Sur l'ensemble du corpus,
**environ un fichier sur trois livré automatiquement était le mauvais document**,
et la validation le laissait passer parce qu'elle vérifie qu'il y a du texte, pas
que c'est le bon texte.

Cas réels, tous passés en `page1_validated` avant relecture humaine :

- un livre sur Chicago à la place d'un traité sur les tempéraments ;
- un article de biochimie sur les esters de cholestérol à la place de McFadden ;
- des **recensions** parues dans *American Anthropologist* à la place de l'article
  de Bourguignon ;
- le **protocole** Cochrane de 2008 à la place de la **revue** de 2010 — même
  titre, même auteurs, document différent ;
- un aperçu éditeur de deux pages à la place d'un chapitre ;
- un même livre livré deux fois sous deux titres d'article différents ;
- un article de littérature portugaise à la place d'une revue systématique.

**Ce qui aiderait** : comparer le texte extrait de la page 1 au triplet
titre / auteurs / année et **refuser sous un seuil**, en consignant le score dans
le journal de validation. Même grossier, un tel score aurait attrapé six des sept
cas ci-dessus. Le septième — protocole contre revue — demande de comparer aussi
le sous-titre, ce qu'aucun score simple ne fera.

### 1.4 Divers, moins graves

- **`pdf_acquired` reste bloqué** : des documents acquis n'avançaient jamais, il a
  fallu forcer l'état à la main après lecture.
- **Fiche écrite hors de `refs/`** — `penman_2009_deeplisteners.md` s'est retrouvée
  dans `sources/transe/Sources/`, donc invisible au registre.
- **Liens internes cassés par des slugs devinés** : `de_2020_stress` pour
  `dewitte_2020_stress`, `galanter_2003_whatis` pour `galanter_2003_generative`.
  Neuf cas. Une commande de vérification des liens manquerait moins si elle
  existait.

---

## 2. Acquisition — ce qui marche, mesuré

### 2.1 Classement observé sur quatre mois

1. **Voie navigateur** (`nav_download`) — la meilleure de loin ; passe là où les
   requêtes reçoivent 403.
2. **LibGen par identifiant** — bon sur l'ancien et les grandes revues.
3. **Dépôts ouverts par DOI strict** — bon sur le libre accès récent.
4. **ResearchGate avec témoins de session** — fonctionne, mais demande les témoins.
5. **Anna's Archive en navigateur** — bloqué par le contrôle anti-robot.

### 2.2 Le rendement s'effondre, et ce n'est pas un défaut

Passages récents : **2 sur 55**, **1 sur 40**, **0 sur 51**, **1 sur 34**.

Ce n'est pas une régression : la moitié facile du corpus est acquise, et le
résidu est structurellement dur. Mais le chiffre affiché devient trompeur.

**Ce qui aiderait** : rapporter le rendement **sur les fiches nouvellement
ajoutées**, pas sur l'ensemble des fiches en attente.

### 2.3 Obstacles nouveaux, à connaître

- **Les miroirs Sci-Hub sont injoignables** depuis certains réseaux : `.se`, `.st`,
  `.ru`, `.wf` ne répondent pas du tout (code 000). La cascade les essaie
  pourtant **une fois par fiche**, soit 51 délais d'attente pour rien.
  → détecter l'injoignabilité **une seule fois** et sauter la source pour le
  passage entier.
- **Plusieurs éditeurs refusent tout client non navigateur** mais servent un
  navigateur sans difficulté : **MDPI**, **PMC**, **JMIR**, **ASHA**. PMC est le
  plus trompeur — `pmc.ncbi.nlm.nih.gov/…/pdf/` rend du HTML avec un code 200.
- **ProQuest est un mur** : aucune voie, jamais. Trois thèses du corpus y sont
  définitivement bloquées. Un verdict propre — `depot_de_theses_ferme` — éviterait
  de les réessayer à chaque passage.

### 2.4 Ce qui manque le plus à l'usage

- **Un filtre de cibles.** `nav_download` parcourt **toutes** les fiches en attente
  à chaque appel. Acquérir cinq nouvelles références coûte dix minutes et rejoue
  cinquante échecs connus. Un `--only slug1,slug2` changerait tout.
- **Une sortie non tamponnée.** Rien ne s'affiche avant la fin du passage : sur un
  quart d'heure, on ne sait pas si l'outil travaille ou s'il est bloqué.
- **`--urls` est la meilleure soupape du greffon** — donner l'adresse exacte du PDF
  quand on la connaît sauve la mise régulièrement. Elle mériterait d'être
  documentée dans `docs/USAGE.md`, elle n'y est pas.

---

## 3. Ce que le terrain apprend sur le procédé lui-même

### 3.1 Le dépôt à la main est une voie de première classe

Sur ce corpus, l'utilisateur a récupéré à la main des dizaines de documents que
l'automate n'atteignait pas. C'est le meilleur canal disponible, et il est le
moins outillé.

Deux constats :

- **L'appariement d'`intake.py` n'est pas fiable** : il rapproche par ressemblance
  de nom de fichier et se trompe. Il ne devrait **jamais** écrire un état
  au-dessus de `pdf_acquired`, et devrait proposer un appariement avec un indice
  de confiance plutôt que de décider.
- Un dépôt contient **toujours** du bruit : doublons exacts, mauvaise version
  (protocole contre revue), documents hors périmètre. Prévoir un `non_integres/`
  avec un motif écrit est devenu une étape systématique.

### 3.2 La liste « à récupérer » doit filtrer sur les tentatives, pas sur l'affichage

Mon outil local filtrait sur « a déjà figuré dans une liste remise ». Faux : être
proposé n'est pas avoir essayé. L'utilisateur s'est retrouvé privé des références
qu'il avait seulement vues passer.

**Ce qui aiderait côté greffon** : un indicateur explicite du type
`tentative_humaine: oui`, plutôt que de laisser chaque coffre reconstruire cette
information en comparant des versions passées d'un fichier.

### 3.3 Deux états manquent au vocabulaire

- **Document partiel.** Deux cas rencontrés : une **première page seulement**
  (article de revue tronqué) et une **épreuve non corrigée**. Les deux sont
  utilisables, mais pas citables de la même façon. Je l'ai noté dans le verdict de
  validation, ce qui marche mais n'est pas interrogeable.
- **Année incertaine.** Une thèse sans date : la bibliographie s'arrête à 2013, le
  fichier a été produit en 2019. J'ai inventé un champ `annee_incertaine`. Il en
  faudrait un vrai, ou une convention.

---

## 4. Ce qui marche très bien, et qu'il ne faut pas casser

- **La machine à états** tient sur quatre mois et 316 fiches sans incohérence.
  `pt status` est le tableau de bord réel du projet.
- **Le champ `cited_in`** permet de constituer un sous-corpus par sujet en une
  ligne — c'est ce qui a permis d'extraire un dossier complet de 61 fiches pour un
  projet dérivé, en quelques secondes.
- **`pdf_sha256`** a servi exactement à ce pour quoi il est fait : reconnaître un
  doublon livré sous un autre nom, et garder la preuve après avoir sorti les
  documents du suivi git.
- **`rejected_sha256`** évite de rejouer un mauvais fichier. Bien vu.
- **Le mode `--pause`** de la voie navigateur passe là où tout le reste échoue.

---

## 5. Par ordre d'utilité, si je devais choisir

1. **Score de concordance page 1** contre titre et auteurs, avec refus sous seuil.
   C'est le défaut qui coûte le plus cher : un mauvais document intégré contamine
   un état de l'art entier, et seul un humain le rattrape.
2. **Validation du YAML à l'écriture**, et erreur nommée à la lecture.
3. **`--only <slugs>`** sur les outils d'acquisition.
4. **Détection unique de source injoignable** au lieu d'un essai par fiche.
5. **Assainissement des titres** reçus des fournisseurs de métadonnées.
6. **Sortie non tamponnée** pendant les passages longs.
