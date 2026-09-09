# NotebookLM integration — optional tool

> Optional integration. Activate via `RESEARCH_ENABLE_NOTEBOOKLM=1` and
> configure `mcp__notebooklm` in your `~/.claude/mcp.json` or
> `<project>/.mcp.json`. Used by the `sota-writer` skill in phase A as
> a complementary source when querying books / domain corpora.

## When to use

Use NotebookLM as a research source in phase A of sota-writer when :

- The topic involves a corpus of books / domain-specific texts that
  paper-search MCP doesn't cover (e.g., ethnographic monographs,
  domain-specific textbooks, pre-2000 publications)
- You want to query a curated corpus the user has already imported
  into their NotebookLM (with notebooks pre-populated)
- You need narrative answers grounded in specific book sections rather
  than abstracts

Do NOT use when :

- The corpus is purely papers — paper-search MCP is more efficient
- The user hasn't configured NotebookLM (skip silently)
- You want raw text extraction — use `mcp__rtfm` if configured

## Tools available (when configured)

- `mcp__notebooklm__ask_question` : query a notebook
- `mcp__notebooklm__list_notebooks` : inventory notebooks
- `mcp__notebooklm__select_notebook` : set active notebook
- `mcp__notebooklm__list_content` : list sources in a notebook
- `mcp__notebooklm__add_source` : add a source (PDF, URL, text)
- `mcp__notebooklm__generate_content` : generate report/summary
- `mcp__notebooklm__generate_audio` : Deep Dive podcast
- `mcp__notebooklm__download_audio` : save podcast

## Typical workflow (sota-writer phase A)

```
1. mcp__notebooklm__list_notebooks
   → identifies the notebook relevant to the topic
2. mcp__notebooklm__select_notebook(notebook_id=X)
3. mcp__notebooklm__ask_question(question=..., source_format="footnotes")
   → returns narrative answer + cited source pages
4. Cross-reference cited sources :
   - For book chapters cited : note them as candidate refs in the
     paper-trail registry (state=candidate, type=book)
   - For papers cited within the book : add them to phase A candidates
     via paper-search
```

## Output conventions

When NotebookLM is invoked as a source in sota-writer phase A :

- Each candidate ref derived from NotebookLM must have
  `source: notebooklm:<notebook_id>` in its `state_history[0].meta`
- For book sources : `type: book` in the frontmatter
- For papers cited within a book : create a separate ref with the
  paper's metadata (NOT the book metadata) and reference the
  NotebookLM finding in `state_history[0].meta.notebooklm_context`

## Skip semantics

If `RESEARCH_ENABLE_NOTEBOOKLM=1` is not set, or if the
`mcp__notebooklm__*` tools are not available in the current MCP
configuration, the sota-writer skill **skips this source silently**
and proceeds with paper-search + WebSearch only. No error, no warning.

## Pre-requisites

- NotebookLM MCP server running (project-specific configuration)
- Google authentication configured for the MCP server
- Notebooks pre-populated by the user with the relevant corpus

These are out-of-scope for paper-trail. The plugin only consumes the
MCP if available.
