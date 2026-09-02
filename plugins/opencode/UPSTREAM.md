# OpenCode adapter upstream

This plugin tracks `bobowsh/dsh-llm-opencode` main at commit
`f4d1176e3205b5d3750916c652b49fb399aafb2b`.

The upstream adapter's transport, SSE completion handling, free-model catalog
sync, retry/error classification, and configurable provider behavior are the
reference for this plugin. ZeroWall keeps its local integration boundary:
durable image attachments are encoded as data URLs, credentials remain outside
model catalogs and logs, and the plugin is registered through the generated
ZeroWall bundle patch. The upstream implementation's text-only guard is not
copied because it would regress the existing image attachment contract.
