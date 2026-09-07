# ZeroWall PubMed

Native literature tools, encrypted per-service configuration, and project-scoped evidence storage. Settings are under Environment > Literature services. The 25 upstream tool names are retained, with project save/list/export tools added. Session drafts are temporary; explicit commits persist to the research database.

Based on dsh-pubmed 0.4.1, commit 28ea7258dfc3edeaf44d3b8e52c57d8ff3a787b3, https://github.com/aiyacharley/dsh-pubmed (Apache-2.0). Its PubMed capabilities derive from https://github.com/cyanheads/pubmed-mcp-server (Apache-2.0). Upstream core, NLP and word lists retain their Apache-2.0 license; see THIRD_PARTY_LICENSES. The ZeroWall adapter follows the repository license.

Local adaptations replace runtime source evaluation with ESM; inject scoped credentials at HTTP dispatch; enforce cancellation, rate limits, source disablement and bounded retries; replace personal JSON persistence with project transactions; preserve distinct extraction provenance; and avoid repeated graph contributions. Source upgrades must rerun the regression suite.
