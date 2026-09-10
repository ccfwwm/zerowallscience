# ZeroWall Science 5.17.0

## Literature workflow

- Updated `zerowall-literature` with automatic task-directory derivation and MinerU parsed-directory bootstrap.
- Restored cited-by provider cross-check requests for OpenAlex, PubMed, Semantic Scholar and Europe PMC metadata.
- Expanded author enrichment to include OpenAlex, PubMed, SciMaster-compatible cross-source requests and independent DeepSeek, Bing, Exa and Tavily searches for every cited-paper author.
- Preserved the cited-by-only boundary: target-paper authors and reference lists are excluded from author analysis.
- Improved journal abbreviation and latest impact-factor evidence requests, including ISO 4 terminology and year/source requirements.
- Added deterministic helpers for evidence execution, author fact application and JIF repair; shared verified data remains empty by default.
- Bundled TSG CLI documentation now uses the skill-local credential-compatible implementation; backup files are excluded from packaged resources.

## Desktop reliability

- Fixed trusted Harness clipboard permission checks when authenticated URLs contain query parameters.
- Clipboard read/write regression coverage now exercises native copy, `read()`/`readText()`, and HTML/plain-text `ClipboardItem` flows used by the spreadsheet plugin.
