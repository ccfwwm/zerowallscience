---
name: zerowall-mcp-guide
description: Route scientific tasks to the correct ZeroWall MCP service without exposing credentials.
whenToUse: When a request may involve more than one scientific MCP or the correct tool family is unclear.
---

Use the smallest suitable MCP family. Biomedical analysis and Biomni agent work use `biomni_runtime`, `biomni_catalog`, `biomni_execute`, `biomni_jobs`, and `biomni_artifacts`; general R projects, computation, and workspace uploads use `r_runtime`, `r_project`, `r_files`, `r_execute`, `r_jobs`, and `r_packages`; FigureYa plotting, reproducible figures, manifests, asynchronous jobs, and reports use `r_figureya_catalog`, `r_figureya_plan`, `r_figureya_run`, and `r_figureya_artifacts`. Chemical searches, compound details, reactions, structures, and stoichiometry use the AIchem MCP. Scientific writing uses Sci, biological database operations use Bio Tools, and molecular drawing uses Ketcher Chemistry. Use the available MCP tools directly and follow their schemas; do not invent tool names.

Prefer read-only operations first. Any save, upload, cancel, publish, or other side effect must follow the tool's confirmation contract, including `confirm=true` where required. Keys are configured in ZeroWall Settings; never request, print, or put a key in arguments or prompts.

Keep calls focused on one MCP family. Use catalog/search or describe tools before expensive execution, and return references to large files, manifests, and images rather than copying their complete contents into the conversation.

