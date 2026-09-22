# Obesity--alopecia candidate data reconnaissance

Retrieved 2026-09-22 (Asia/Shanghai). This is a read-only source inventory for
the first research gate. It is not an approved question, analysis plan, MR
result, or clinical conclusion.

## Scope and method

The GWAS Catalog REST study records below were fetched directly from the
official API. Full summary-statistic availability was checked separately from
the study metadata, because a catalogued association is not itself an
analysis-ready file. The catalog documents that complete statistics are hosted
on its FTP service only when available and that API access to summary statistics
has been deprecated.

Sources checked:

- [GWAS Catalog summary-statistics documentation](https://www.ebi.ac.uk/gwas/docs/methods/summary-statistics)
- [GCST006661 record](https://www.ebi.ac.uk/gwas/rest/api/studies/GCST006661)
- [GCST90428588 record](https://www.ebi.ac.uk/gwas/rest/api/studies/GCST90428588)
- [GCST90428476 record](https://www.ebi.ac.uk/gwas/rest/api/studies/GCST90428476)
- [GCST010721 record](https://www.ebi.ac.uk/gwas/rest/api/studies/GCST010721)
- [GCST009057 record](https://www.ebi.ac.uk/gwas/rest/api/studies/GCST009057)

## Candidate outcome sources

| Accession | Catalogued phenotype and sample | Input availability check | Contract status |
| --- | --- | --- | --- |
| `GCST006661` | Male-pattern baldness; 52,874 British-ancestry males; European ancestry; UK recruitment; PMID 28196072 | Record says `fullPvalueSet=true`. The [public FTP directory](https://ftp.ebi.ac.uk/pub/databases/gwas/summary_statistics/GCST006001-GCST007000/GCST006661/) listed `Hagenaars2017_UKB_MPB_summary_results.zip` (293 MB, last modified 2019-01-11) and `harmonised/` when checked. | Candidate only. Confirm build, fields, effect allele, units, sex coding, and license after downloading manifest/file metadata. |
| `GCST90428588` | Male pattern hair loss; 72,469 British-ancestry individuals; European ancestry; UK Biobank; exome-wide sequencing; PMID 37737258 | Record says `fullPvalueSet=false`; no public FTP directory was confirmed by this check. | Not MR-ready. Do not substitute it for `GCST006661` or infer a male-only phenotype. |
| `GCST90428476` | Alopecia areata; 408 Taiwanese-ancestry cases and 8,167 controls; East Asian ancestry; Taiwan; PMID 37752970 | Record says `fullPvalueSet=false`; no public FTP directory was confirmed by this check. | Separate autoimmune phenotype and ancestry. Not interchangeable with male-pattern baldness and not MR-ready from this evidence. |

## BMI comparison sources

| Accession | Catalogued phenotype and sample | Reason not selected now |
| --- | --- | --- |
| `GCST010721` | Body mass index; 1,142 Indian discovery participants plus 6,117 replication participants; South Asian ancestry; PMID 32363570 | The available record does not establish a compatible male European analysis population, a matching effect scale/build, full statistics, or no sample overlap. |
| `GCST009057` | Body mass index; 14,126 African-ancestry participants; Sub-Saharan African ancestry; recruitment across Kenya, Uganda, South Africa, Ghana, and Nigeria; PMID 31675503 | Population differs from the male European baldness candidate. The study record alone does not establish a compatible MR input contract. |

The preliminary Catalog query returned many BMI records. It does **not** establish
that a BMI source matching the outcome by ancestry, sex, build, sample overlap,
effect scale, and legal access has been found.

## Candidate dataset-contract fields

The only possible current pairing is a **pending** candidate, never an approved
MR pair:

| Contract field | Exposure (BMI) | Outcome (male-pattern baldness) |
| --- | --- | --- |
| Source accession | Unselected | `GCST006661` |
| Phenotype definition | Unknown until a specific record and metadata file are reviewed | Catalogue label only; phenotype questionnaire/definition still to verify |
| Population / sex | Must be compatible with the frozen outcome target | British-ancestry males; European ancestry indicated by Catalog |
| Genome build / coordinate system | Unknown | Unknown until summary-statistic metadata is inspected |
| Effect allele, beta/SE, units, allele frequency | Unknown | Unknown until file schema is inspected |
| Full summary statistics | Must be directly accessible under allowed terms | Public directory observed; content/schema/license still pending |
| Sample overlap | Unknown | Unknown |
| Independence / replication | Unknown | No independent replication source approved |
| Permission / license | Unknown | Unknown; verify before import or redistribution |

## Tissue and molecular-evidence status

No scalp or hair-follicle expression/QTL dataset is approved by this
reconnaissance. A prior attempt to use guessed GTEx API paths returned 404, so
no GTEx tissue availability is inferred. Whole blood, skin not explicitly
mapped to scalp, or any other tissue must not be relabelled as hair-follicle
evidence. Molecular QTL, regional summary data, LD source, and tissue/donor
metadata remain required before molecular MR or colocalization can be planned.

## Gate-one decision inputs still required

1. Choose one outcome phenotype: male-pattern baldness, alopecia areata, or a
   separately defined hair-loss phenotype. These are distinct research targets.
2. Identify one compatible BMI/obesity source and verify summary-statistic
   schema, ancestry, sex, genome build, effect scale, permission, and any
   sample overlap with the outcome cohort.
3. Obtain and inspect a machine-readable manifest or file header before
   declaring either source usable.
4. Register an independent validation source or record its absence.
5. Keep the molecular path optional until a tissue-appropriate QTL source,
   complete regional data, and compatible LD reference have been verified.

Until these inputs are completed, the proper output is a data-gap report and
no execution, freeze, causal estimate, colocalization claim, mechanism claim,
or clinical statement is allowed.
