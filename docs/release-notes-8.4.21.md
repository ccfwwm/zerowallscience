# ZeroWall Science 8.4.21

- Restores all Sub2API image groups named with 生图 or 图片, including legacy model lists without capability flags. Group platform metadata correctly selects Gemini versus OpenAI Images, including cached directories.
- Image settings keep low, medium, high, xhigh and max available alongside Auto, preserve the current selection during refresh/failure, and show stale groups instead of silently dropping them. Explicit quality values pass through unchanged; native Gemini image requests omit quality.
- Built-in image tools remain visible with large tool catalogs. SDK Host tool lists refresh after capability activation or removal, preserving scoped visibility, real schemas and Host approvals; image generation needs no separate external MCP service.

- Internal Host and PowerShell commands now resolve Python through the fixed ZeroWall runtime, reject inherited interpreter redirects, and fail clearly while the runtime is unavailable.
- The first packaged startup restores legacy conversations, attachments, workspace indexes, account credentials and user settings into LocalAppData before the Host reads them. Windows credentials are re-encrypted for the new profile key, including ciphertext copied by earlier builds. Existing current data and selections are retained, changed documents are backed up, and a completion receipt skips recovery on later launches. Dependencies, Python and caches are excluded. After successful recovery and workbench readiness, obsolete runtime/cache directories are deleted asynchronously; locked files are skipped and original user data stays intact.
- Credential decryption failures retain the encrypted entry for recovery instead of silently deleting login data.
- Both CLI launchers use the same LocalAppData profile as the desktop, retaining explicit profile overrides even when legacy Roaming data exists.
- Agent presets cap filesystem reads at 200 lines. Skill search reports the provider and whether the active Agent can load each result; the core prompt clarifies shell permission and Python boundaries.
- PubMed title matching has a longer bounded network request. Account, AI media, environment, image, presentation, Python, and research plugin updates are included in the refreshed plugin snapshot.
