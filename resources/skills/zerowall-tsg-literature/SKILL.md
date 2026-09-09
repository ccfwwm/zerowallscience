---
name: zerowall-tsg-literature
description: Search authorized TSG Yun literature, submit full-text requests, poll request status, and download approved PDFs through the command-line workflow.
whenToUse: Use when the user asks to search, request, monitor, or download literature from TSG Yun/智慧云图书馆. Only use the account's authorized access; never bypass access controls or print credentials.
---

Use the bundled TSG literature CLI from `C:/softworks/gpt-tools/tsg-literature-cli` (or the installed ZeroWall runtime copy). Credentials are injected by ZeroWall environment configuration; never ask the user to paste them into a prompt or tool argument.

Required environment variables are the four browser cookies shown by the TSG
cookie store:

- `TSG_PM_JSESSIONID`: `JSESSIONID` for `pm.yuntsg.com`.
- `TSG_SESSIONID`: `SESSIONID` for `user.tsgyun.com`.
- `TSG_SGUSER`: `sguser` for `.yuntsg.com`.
- `TSG_TSGUSER`: `tsguser` for `.tsgyun.com`.

No separate API token is required. These values are domain-scoped and are
never printed or included in reports.

Use `search` first and show the matching PMID/title list. Submit requests only after the user has selected PMID values. The service allows at most 20 applications per request. Use `watch` for pending requests and `download` only for status `2` records. The downloader reproduces the viewer's AES-CBC URL generation locally and validates the `%PDF-` signature before saving.

Keep task state in a user-selected state directory. Do not log tokens, cookies, generated attachment URLs, or PDF contents. Explain that access is limited to the user's personal learning/research authorization and follow the site's copyright terms.
