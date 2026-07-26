# Bio-Tools MCP Connector Mapping

## Summary

From `myscience/assets/mcp-servers/bio-tools`:
- **18 domain MCP servers** (mcp_* directories with server.py)
- **213 @mcp.tool endpoints** across those servers
- **62 supporting fleet packages** (individual API clients)

Target: **23 domain groups** with **247 tools** for P4 Phase 1

## Current Tool Distribution

### Implemented Domain Servers (18)

1. **mcp_literature** (9 tools) → literature domain
   - openalex_search_works, openalex_get_work, openalex_citations
   - openalex_references, openalex_search_authors, openalex_get_author
   - openalex_venue_info, arxiv_search, arxiv_get_papers

2. **mcp_clinical_genomics** (20 tools) → variants domain
   - clinvar_search_variants, clinvar_get_variant, dbsnp_search_rsids
   - dbsnp_get_rsid, gnomad_search_variants, gnomad_get_variant
   - clingen_search_dosage, clingen_get_dosage, civic_search_evidence
   - civic_get_evidence, civic_get_variant, gwas_catalog_search
   - gwas_catalog_get_study, cadd_scores_batch, pheweb_list_portals
   - pheweb_search_variants, eqtl_catalogue_studies, eqtl_catalogue_associations
   - pharmgkb_search_variants, pharmgkb_get_variant

3. **mcp_expression** (15 tools) → gene-expression domain
   - gtex_expression_by_gene, gtex_expression_by_tissue, gtex_eqtls
   - geo_search_datasets, geo_get_dataset, arrayexpress_search_experiments
   - arrayexpress_get_experiment, encode_search_experiments
   - encode_get_file, protein_atlas_expression, protein_atlas_pathology
   - protein_atlas_immunohistochemistry, panglaodb_markers
   - cellxgene_census_datasets, cellxgene_query_cells

4. **mcp_structures_interactions** (16 tools) → protein-structure + protein-interactions
   - pdb_search_structures, pdb_get_structure, pdb_search_similar
   - alphafold_get_prediction, alphafold_coverage
   - emdb_search_entries, emdb_get_entry
   - string_get_network, string_search_interactions
   - intact_search_interactions, intact_get_interaction
   - complexportal_search, complexportal_get_complex
   - bindingdb_search_affinities, bindingdb_get_target
   - rhea_search_reactions

5. **mcp_chemistry** (12 tools) → chemistry domain
   - pubchem_search_compounds, pubchem_get_compound, pubchem_similar
   - chebi_search_entities, chebi_get_entity
   - zinc_search_compounds, zinc_get_substance
   - chembl_search_compounds, chembl_get_compound
   - chembl_search_targets, chembl_get_target
   - chembl_search_assays

6. **mcp_variants** (18 tools) → variants domain (complement to clinical_genomics)
   - ensembl_variant_by_id, ensembl_vep, ensembl_variant_consequences
   - myvariant_query, myvariant_get_variant
   - clinvar_allele_registry, dbnsfp_scores
   - cosmic_search_mutations, cosmic_get_mutation
   - oncokb_annotate_mutations, oncokb_genes
   - pharmvar_alleles, pharmvar_gene_variants
   - lovd_search_variants, lovd_databases
   - decipher_variants, decipher_syndromes
   - gnomad_constraint_metrics

7. **mcp_genes_ontologies** (10 tools) → ontology domain
   - quickgo_annotations, quickgo_search_terms
   - ols_search_terms, ols_get_term, ols_ontologies
   - mygene_query, mygene_get_gene
   - biomart_query_genes, biomart_datasets
   - hgnc_search_genes

8. **mcp_genomes** (11 tools) → genomics domain
   - ensembl_rest_sequence, ensembl_rest_lookup
   - ensembl_rest_overlap, ensembl_rest_homology
   - ncbi_datasets_genome, ncbi_datasets_gene
   - ucsc_tracks_list, ucsc_tracks_data
   - refseq_assembly_summary, refseq_gene_info
   - gencode_releases

9. **mcp_omics_archives** (17 tools) → metabolomics + transcriptomics + single-cell
   - metabolights_search_studies, metabolights_get_study
   - pride_search_projects, pride_get_project
   - massive_search_datasets, massive_get_dataset
   - ega_search_datasets, ega_get_dataset
   - dbgap_search_studies, dbgap_get_study
   - sra_search_runs, sra_get_run
   - arrayexpress_search_experiments_v2
   - biostudies_search, biostudies_get_study
   - zenodo_search_records, zenodo_get_record

10. **mcp_protein_annotation** (13 tools) → proteomics domain
    - uniprot_search_proteins, uniprot_get_protein
    - interpro_search_entries, interpro_get_entry, interpro_protein_matches
    - pfam_search_families, pfam_get_family
    - prosite_search_patterns, prosite_get_pattern
    - phosphosite_modifications, phosphosite_regulatory_sites
    - elm_motifs, elm_get_motif

11. **mcp_drug_regulatory** (7 tools) → regulatory domain
    - openfda_drugs_search, openfda_drugs_get
    - openfda_adverse_events, openfda_labels_search
    - ema_medicines_search, ema_get_medicine
    - clinicaltrials_gov_interventions

12. **mcp_regulation** (16 tools) → pathways domain
    - reactome_pathway_search, reactome_get_pathway
    - reactome_analysis_species, reactome_diagram
    - kegg_list_pathways, kegg_get_pathway, kegg_find_genes
    - wikipathways_search, wikipathways_get_pathway
    - biocyc_search_pathways, biocyc_get_pathway
    - jaspar_search_matrices, jaspar_get_matrix
    - encode_tfbs, unibind_tfbs
    - rfam_families_search

13. **mcp_cancer_models** (11 tools) → cell-lines domain
    - depmap_search_lines, depmap_get_line, depmap_gene_dependencies
    - cbioportal_studies_list, cbioportal_get_study
    - cbioportal_mutations, cbioportal_clinical_data
    - cosmic_cell_lines_search, cosmic_get_cell_line
    - atcc_search_lines, atcc_get_line

14. **mcp_cellguide** (5 tools) → single-cell domain
    - cellguide_search_types, cellguide_get_type
    - cellguide_markers, cellguide_ontology
    - cellguide_tissue_atlas

15. **mcp_human_genetics** (14 tools) → clinical-trials domain (human phenotype/disease)
    - omim_search_entries, omim_get_entry
    - orphanet_search_diseases, orphanet_get_disease
    - hpo_search_terms, hpo_get_term, hpo_disease_associations
    - mondo_search_diseases, mondo_get_disease
    - disgenet_gene_disease, disgenet_variant_disease
    - opentargets_associations, opentargets_target_profile
    - opentargets_drug_evidence

16. **mcp_research_resources** (5 tools) → biobanks + antibodies
    - antibody_registry_search, antibody_registry_get
    - addgene_plasmids_search, addgene_get_plasmid
    - biobank_directory_search

17. **mcp_rna** (9 tools) → transcriptomics domain
    - rfam_families_search, rfam_get_family
    - rnacentral_search, rnacentral_get_sequence
    - mirbase_search, mirbase_get_mirna
    - targetScan_predictions, lncipedia_search
    - lncrna_disease_associations

18. **mcp_zinc** (5 tools) → drug-discovery domain
    - zinc_search_compounds, zinc_get_substance
    - zinc_analogs, zinc_purchasability
    - zinc_biogenic_compounds

### Missing Domain Groups (5)

Need to create or identify tools for:

19. **clinical-trials** (separate from human_genetics)
    - Current: clinicaltrials_gov_interventions in mcp_drug_regulatory
    - Need: dedicated clinical trials search/registry tools (6-8 tools)

20. **imaging** 
    - Need: microscopy databases, imaging archives (8-10 tools)

21. **epidemiology**
    - Need: outbreak data, disease surveillance (6-8 tools)

22. **assays**
    - Need: bioassay protocols, screening data (6-8 tools)

23. **taxonomy**
    - Need: NCBI Taxonomy, species classification (6-8 tools)

### Tool Count Gap Analysis

- Current: 213 tools across 18 domains
- Target: 247 tools across 23 domains
- Gap: **34 tools** across **5 missing domains**

## Domain Group Mapping (23 groups)

### Confirmed Mappings

1. **literature** ← mcp_literature (9 tools)
2. **clinical-trials** ← needs 6-8 new tools + clinicaltrials_gov_interventions
3. **genomics** ← mcp_genomes (11 tools)
4. **variants** ← mcp_clinical_genomics (20) + mcp_variants (18) = 38 tools → needs consolidation
5. **gene-expression** ← mcp_expression (15 tools)
6. **proteomics** ← mcp_protein_annotation (13 tools)
7. **protein-structure** ← mcp_structures_interactions (16 tools, structure subset)
8. **protein-interactions** ← mcp_structures_interactions (16 tools, interaction subset)
9. **chemistry** ← mcp_chemistry (12 tools)
10. **drug-discovery** ← mcp_zinc (5 tools) + chembl subset
11. **metabolomics** ← mcp_omics_archives (17 tools, metabolomics subset)
12. **transcriptomics** ← mcp_rna (9 tools) + mcp_omics_archives (transcriptomics subset)
13. **single-cell** ← mcp_cellguide (5 tools) + cellxgene tools
14. **imaging** ← needs 8-10 new tools
15. **pathways** ← mcp_regulation (16 tools)
16. **ontology** ← mcp_genes_ontologies (10 tools)
17. **taxonomy** ← needs 6-8 new tools
18. **epidemiology** ← needs 6-8 new tools
19. **regulatory** ← mcp_drug_regulatory (7 tools)
20. **biobanks** ← mcp_research_resources (5 tools, biobank subset)
21. **cell-lines** ← mcp_cancer_models (11 tools)
22. **antibodies** ← mcp_research_resources (5 tools, antibody subset)
23. **assays** ← needs 6-8 new tools

## Next Steps

1. **Consolidate overlapping domains**: variants domain has 38 tools from two servers, needs to be split/merged to fit target
2. **Split composite servers**: mcp_structures_interactions, mcp_omics_archives, mcp_research_resources need to be split into their constituent domains
3. **Create 5 missing domain groups**: clinical-trials, imaging, epidemiology, taxonomy, assays
4. **Add ~34 new tools** to reach 247 total
5. **Update schema.ts** with accurate domain group list
6. **Create manifest files** for each of the 23 domains
