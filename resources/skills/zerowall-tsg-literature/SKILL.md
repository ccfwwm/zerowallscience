---
name: zerowall-tsg-literature
description: Search authorized TSG Yun literature, submit full-text requests, poll request status, and download approved PDFs through the command-line workflow.
whenToUse: Use when the user asks to search, request, monitor, or download literature from TSG Yun/智慧云图书馆. Only use the account's authorized access; never bypass access controls or print credentials.
---

Use the CLI bundled with this skill, resolved against this skill's base
directory:

```
scripts/tsg_literature.py
```

Credentials are injected by ZeroWall environment configuration; never ask the
user to paste them into a prompt or tool argument.

Do **not** use the older standalone checkout at
`C:/softworks/gpt-tools/tsg-literature-cli`. That copy has drifted onto a
different credential interface (`TSG_TOKEN`, `TSG_USER_TOKEN`,
`TSG_USER_JSESSIONID`, `TSG_COOKIE`) and fails immediately with
`error: token is required (use --token or TSG_TOKEN)` under the configured
environment. Only the bundled copy reads the four cookies below.

Required environment variables are the four browser cookies shown by the TSG
cookie store:

- `TSG_PM_JSESSIONID`: `JSESSIONID` for `pm.yuntsg.com`.
- `TSG_SESSIONID`: `SESSIONID` for `user.tsgyun.com`.
- `TSG_SGUSER`: `sguser` for `.yuntsg.com`. Also sent as the legacy `token`
  header for the search API.
- `TSG_TSGUSER`: `tsguser` for `.tsgyun.com`. Used for the user centre and the
  full-text viewer.

No separate API token is required. These values are domain-scoped and are
never printed or included in reports. Each one is required: the CLI reports
`missing required TSG cookies: <NAME>` naming the absent value.

## Usage

```powershell
python scripts/tsg_literature.py search "insulin resistance hepatic lipogenesis"
python scripts/tsg_literature.py request <PMID> [<PMID> ...]
python scripts/tsg_literature.py watch --interval 60 --timeout 7200
python scripts/tsg_literature.py download
```

Use `search` first and show the matching PMID/title list. Submit requests only
after the user has selected PMID values. The service allows at most 20
applications per request. Use `watch` for pending requests and `download` only
for status `2` records. The downloader reproduces the viewer's AES-CBC URL
generation locally and validates the `%PDF-` signature before saving.

### Page size

`--size` accepts only `10`, `20`, or `50` (the values the web client's page-size
dropdown offers). For any other value the search backend returns HTTP 200 with
`code: 0`, `msg: "success"` and an **empty** result list, so an unsupported size
is indistinguishable from "no matches found" or a broken login. The bundled
CLI rejects unsupported sizes up front instead. Do not work around this by
passing an odd size; if a search legitimately returns nothing, try a different
term rather than changing `--size`.

### Authentication check

To verify the configured cookies without submitting any request, confirm that a
known term returns results at the default size:

```powershell
python scripts/tsg_literature.py search "cancer"
```

A populated PMID list means the cookies work. An empty list at `--size 10/20/50`
means the cookies are stale or the account lacks access, not that the topic has
no literature.

Keep task state in a user-selected state directory. Do not log tokens, cookies, generated attachment URLs, or PDF contents. Explain that access is limited to the user's personal learning/research authorization and follow the site's copyright terms.
