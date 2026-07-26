---
name: literature-review
description: >
  Systematic literature search and synthesis for scientific research.
  Use this skill to conduct comprehensive literature reviews, identify relevant
  papers, extract key findings, and synthesize evidence across multiple studies.
---

# Literature Review

Conduct systematic literature searches and evidence synthesis to support
scientific research. This skill covers search strategies, paper screening,
data extraction, and synthesis methods for comprehensive literature reviews.

## When to use

- Starting a new research project
- Writing introduction or discussion sections
- Conducting systematic reviews or meta-analyses
- Identifying research gaps and opportunities
- Supporting grant applications or thesis work

## Review types

### Narrative review
Broad overview of a topic; less structured; expert perspective

### Systematic review
Structured, reproducible search; predefined inclusion criteria; quality assessment

### Meta-analysis
Quantitative synthesis of effect sizes across studies; requires statistical methods

### Scoping review
Map the landscape of a research area; identify evidence gaps

## Search strategy

### 1. Define research question
Use PICO framework (Population, Intervention, Comparison, Outcome) for clinical
questions, or adapt for basic science (System, Method, Observation, Context).

### 2. Identify search terms
- Primary keywords from research question
- Medical Subject Headings (MeSH) terms
- Boolean operators: AND, OR, NOT
- Wildcards and truncation: protein*, structur?

### 3. Select databases
- **General**: PubMed, Web of Science, Scopus, Google Scholar
- **Life sciences**: PubMed, EMBASE, MEDLINE
- **Chemistry**: SciFinder, Reaxys
- **Preprints**: bioRxiv, medRxiv, arXiv, ChemRxiv

### 4. Example search query
```
(("protein structure prediction" OR "structural biology")
 AND ("deep learning" OR "machine learning" OR "neural network")
 AND ("alphafold" OR "rosetta" OR "template-based"))
```

## Search execution

### PubMed
```
Search: protein structure prediction AND deep learning
Filters: Publication date (last 5 years), Article type (Review, Original Research)
Export: MEDLINE format for reference management
```

### Web of Science / Scopus
- Citation tracking: "Cited by" and "References" to find related work
- Citation alerts: Monitor new citations to key papers

## Paper screening

### Title/abstract screening
Quick first pass to exclude obviously irrelevant papers

### Full-text screening
Apply inclusion/exclusion criteria:
- Relevant population/system
- Appropriate methods
- Outcomes of interest
- Publication quality

### Screening tools
- Covidence, Rayyan (systematic reviews)
- Zotero, Mendeley (reference management)
- Spreadsheets for tracking decisions

## Data extraction

Create extraction forms with:
- Study metadata (authors, year, journal)
- Study design and methods
- Sample characteristics
- Key findings and effect sizes
- Quality metrics

## Quality assessment

### For randomized trials
- Cochrane Risk of Bias tool
- JADAD scale

### For observational studies
- Newcastle-Ottawa Scale
- ROBINS-I

### For computational studies
- Reproducibility: Code and data availability
- Validation: Independent test sets, cross-validation
- Comparisons: Benchmarks against existing methods

## Synthesis approaches

### Qualitative synthesis
- Thematic analysis
- Narrative summary by topic/method/outcome
- Tables summarizing study characteristics and findings

### Quantitative synthesis (meta-analysis)
```r
library(metafor)

# Random-effects meta-analysis
res <- rma(yi = effect_size, vi = variance, data = studies)
forest(res)
funnel(res)  # Publication bias assessment
```

## Reporting standards

### PRISMA (Preferred Reporting Items for Systematic Reviews)
- Flow diagram showing search and screening results
- Checklist of required reporting elements
- Transparent, reproducible methods

### Registration
- PROSPERO (systematic reviews in health)
- OSF (open science framework) for pre-registration

## Tools and automation

### Reference management
- Zotero, Mendeley, EndNote
- Paperpile, ReadCube

### Citation networks
- Connected Papers, Research Rabbit
- Semantic Scholar, Scite.ai

### Screening automation
- ASReview (AI-assisted screening)
- Abstrackr, Rayyan

### Extraction
- Spreadsheets, REDCap
- Systematic review software (Covidence, DistillerSR)

## Best practices

- **Document everything**: Search strings, databases, dates, results
- **Use multiple databases**: Each has unique coverage
- **Track citations**: Forward and backward citation tracking
- **Screen independently**: Two reviewers for systematic reviews
- **Assess quality**: Don't just count papers; evaluate evidence strength
- **Update searches**: Re-run before publication to catch recent work
- **Report transparently**: Follow PRISMA or field-specific guidelines

## Common issues

| Issue | Solution |
|---|---|
| Too many results | Refine search terms; add filters; use MeSH/controlled vocabulary |
| Too few results | Broaden search; check synonyms; try different databases |
| Duplicates across databases | Use reference manager deduplication |
| Bias in selection | Define inclusion criteria a priori; use independent reviewers |
| Publication bias | Search grey literature, trial registries; use funnel plots |

## Output formats

- Literature review section for papers
- Standalone review article
- Evidence tables
- PRISMA flow diagram
- Meta-analysis forest plots

## Related skills

- `pdf-explore` — Deep analysis of individual papers
- `bear-*` — Extract specific elements (methods, results, figures, etc.)
- `traceability-review` — Verify citation chains and data provenance
- `paper-narrative` — Structure findings into coherent narrative

---

**Next:** Screen and extract data from identified papers, synthesize findings
across studies, or prepare evidence tables for manuscript.
