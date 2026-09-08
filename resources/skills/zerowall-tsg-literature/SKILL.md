---
name: zerowall-tsg-literature
description: Search authorized TSG Yun literature, submit full-text requests, poll request status, and download approved PDFs through the command-line workflow.
whenToUse: Use when the user asks to search, request, monitor, or download literature from TSG Yun/智慧云图书馆. Only use the account's authorized access; never bypass access controls or print credentials.
---

Use the bundled TSG literature CLI from `C:/softworks/gpt-tools/tsg-literature-cli` (or the installed ZeroWall runtime copy). Credentials are injected by ZeroWall environment configuration; never ask the user to paste them into a prompt or tool argument.

Required environment variables:

- `TSG_TOKEN`: `pm.yuntsg.com` search/application token.
- `TSG_USER_TOKEN`: `user.tsgyun.com` personal-center/full-text token.
- `TSG_PM_JSESSIONID`: optional `pm.yuntsg.com` session cookie.
- `TSG_USER_JSESSIONID`: optional `user.tsgyun.com` session cookie.

Use `search` first and show the matching PMID/title list. Submit requests only after the user has selected PMID values. The service allows at most 20 applications per request. Use `watch` for pending requests and `download` only for status `2` records. The downloader reproduces the viewer's AES-CBC URL generation locally and validates the `%PDF-` signature before saving.

Keep task state in a user-selected state directory. Do not log tokens, cookies, generated attachment URLs, or PDF contents. Explain that access is limited to the user's personal learning/research authorization and follow the site's copyright terms.
