# Genetics execution

Read the connected research_workflow schema for r.genetics. Submit only operations that the server currently advertises. For MR, retain exposure/outcome definitions, beta/SE, effect and other alleles, ancestry, genome build, LD applicability and sample overlap. For coloc, retain the complete region, both trait types, quantitative sdY or case fractions, and explicit p1/p2/p12 priors.

Use the actual submission response for job identifiers and recovery. Read status before retrying a submission; retrieve artifacts through the server-advertised r_files operations. Verify byte counts, SHA-256, runner version and input hash from the returned manifest. Preserve partial/blocked/failed outputs. Unknown remote outcomes must be resolved before a second submission.

Wald requires one valid instrument, IVW at least two, and Egger at least three plus declared strength diagnostics. These minimums do not establish scientific adequacy. A successful calculation does not validate the research hypothesis.
