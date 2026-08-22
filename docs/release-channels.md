# Preview and Stable Channels

| Property | Preview | Stable |
| --- | --- | --- |
| Product name | ZeroWall Science Preview | ZeroWall Science |
| App id | `com.zerowall.science.preview` | `com.zerowall.science` |
| Data directory | `zerowall-science-3-preview` | `zerowall-science-3` |
| Update URL | `/preview/` | `/stable/` |
| Artifact prefix | `zerowall-science-preview-` | `zerowall-science-` |

Preview can coexist with 2.x and Stable. Stable also uses a fresh 3.x data directory; rollback means reinstalling 2.x, whose data remains untouched.

Windows Stable publishes `latest.yml`, the installer, and its blockmap under `/stable/`. The desktop checks this feed shortly after startup and also exposes a manual update action in the sidebar footer. Compatibility manifests for existing 2.x installations remain available at `/releases/latest.json` and `/releases-zerowallsciencedev/latest.json`; both point to the same verified 3.x installer during the rollout.

Stable promotion requires the complete feature matrix, crash recovery, credential audit, full TypeScript and DSH tests, Electron E2E, dependency-license review, Windows install/update smoke, and signed/notarized macOS x64 and arm64 smoke.
