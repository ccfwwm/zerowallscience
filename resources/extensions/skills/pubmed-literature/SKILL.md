---
name: pubmed-literature
description: Search biomedical and cross-disciplinary literature, read open full text, resolve genes/drugs/diseases, trace publication evidence, and build a temporary literature graph in the current conversation.
---

# Literature search and session evidence

Use the available native PubMed tools directly. Prefer the native pubmed tools for literature; do not repeat the same search through Bio Tools unless a distinct capability is needed.

- Broad search: pubmed_search_papers (PubMed, Europe PMC, OpenAlex by default; Semantic Scholar is opt-in). Report perSource failures and retain identifiers and provenance.
- Structured PubMed queries: pubmed_search_articles. Spelling and indexing: pubmed_spell_check, pubmed_lookup_mesh.
- Named biological entities: pubmed_pubtator_entity_id, then pubmed_pubtator_search or pubmed_pubtator_relations. Inspect actual evidence PMIDs; extracted relations are not verified scientific conclusions.
- Reading: pubmed_fetch_articles, pubmed_fetch_fulltext (follow nextOffset), pubmed_europepmc_search and pubmed_europepmc_fetch. No open full text is a valid unavailable result; do not invent access.
- Citation lookup: pubmed_convert_ids, pubmed_lookup_citation, pubmed_format_citations, pubmed_find_related.
- Citation impact and discovery: pubmed_search_s2, pubmed_get_s2_detail, pubmed_get_s2_citations, pubmed_get_s2_recommendations, pubmed_match_paper_by_title. Keep each provider's citation count and retrieval date distinct.
- Annotation: pubmed_pubtator_annotate. PubTator does not require a key and does not inherit the NCBI key quota.
- Session graph: fetching articles may add them to the in-memory graph when AUTO_GRAPH is enabled. Use pubmed_graph_add for explicit additions and pubmed_graph_get for JSON or Mermaid. The graph is scoped to the current conversation and is cleared when reset; it is not saved to a Research Project or persistent library.
- Project save, graph commit, and project export tools are not available. Do not ask the user to create or register a project to search or inspect literature.

Keys and endpoint settings belong in Settings > Environment > Literature services. Never ask for keys in the conversation, inspect credential files, install a second plugin, or write a profile patch. Missing optional keys do not block basic literature search. Respect source disablement and quota errors.
