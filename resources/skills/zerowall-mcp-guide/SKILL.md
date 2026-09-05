---
name: zerowall-mcp-guide
description: Route scientific tasks to the correct ZeroWall MCP service without exposing credentials.
whenToUse: When a request may involve more than one scientific MCP or the correct tool family is unclear.
---

Use the smallest suitable MCP family. Biomedical analysis and Biomni agent work use `mcp__rbioagent__*`; general R projects, computation, and workspace uploads use `mcp__rplatform__*`; FigureYa plotting, reproducible figures, manifests, asynchronous jobs, and reports use `mcp__rplotfigure__*`. Chemical searches, compound details, reactions, structures, and stoichiometry use the AIchem MCP. Scientific writing uses Sci, biological database operations use Bio Tools, and molecular drawing uses Ketcher Chemistry.

Prefer read-only operations first. Any save, upload, cancel, publish, or other side effect must follow the tool's confirmation contract, including `confirm=true` where required. Keys are configured in ZeroWall Settings; never request, print, or put a key in arguments or prompts.

Keep calls focused on one MCP family. Use catalog/search or describe tools before expensive execution, and return references to large files, manifests, and images rather than copying their complete contents into the conversation.
