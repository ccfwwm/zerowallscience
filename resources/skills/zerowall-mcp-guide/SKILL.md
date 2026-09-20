---
name: zerowall-mcp-guide
description: Route scientific tasks to the correct ZeroWall MCP service without exposing credentials.
whenToUse: When a request may involve more than one scientific MCP or the correct tool family is unclear.
---

Remote R, GEO, NHANES, Biomni, FigureYa and OmicVerse tasks use the `zerowall-rmcp` navigation Skill and Host `research_workflow`. Local file transfers use Host `r_files`. These modules share one physical rmcp connection; the compact MCP families are backend interfaces. Discover the exact Host tool with `tool_search` before `tool_dispatch`. Chemical searches use AIchem, scientific writing uses Sci, biological database searches use Bio Tools, and molecular drawing uses Ketcher. Follow each discovered schema.

Prefer read-only operations first. Any save, upload, cancel, publish, or other side effect must follow the tool's confirmation contract, including `confirm=true` where required. Keys are configured in ZeroWall Settings; never request, print, or put a key in arguments or prompts.

Keep calls focused on one MCP family. Use catalog/search or describe tools before expensive execution, and return references to large files, manifests, and images rather than copying their complete contents into the conversation.
