# ZeroWall Science 4.3.12

- Made top-level New Session create independent conversations that are immediately chat-ready without selecting a Workspace.
- Made file attachments appear immediately, start background extraction on drop, and send without waiting for extraction to finish.
- Opened attachment cards as the original PDF, Office, Markdown, image, or binary file; extraction results now use separate actions.
- Routed background extraction through the built-in quick parser when no MinerU Token is configured and through MinerU automatically when a Token is available.
- Stabilized Better Sidebar file refresh and file opening with scoped caching, cancellation, timeouts, stale-response protection, and retry states.
- Integrated MinerU as a first-party Host tool plugin and bundled Skill, with secure Token and API configuration in Environment Settings.
- Restored asynchronous model availability checks, per-model refresh, reasoning controls, model switching, and immediate message echoes.
- Fixed WeChat bot QR-code opening in the desktop client.
- Updated dsh-dream-skin to 8.30.1.
- Preserved explicit artifact, image-duplicate, research graph, and presentation workflows.
