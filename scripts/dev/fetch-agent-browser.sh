#!/usr/bin/env bash
# Fetch the pinned agent-browser binary and place it as a Tauri sidecar
# (apps/desktop/src-tauri/binaries/agent-browser-<target-triple>).
# Runs per-platform locally and in CI so the binary never lives in git.
# agent-browser ships raw (unarchived) binaries per platform on its releases.
set -euo pipefail

AGENT_BROWSER_VERSION="${AGENT_BROWSER_VERSION:-0.32.1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$OUT_DIR"

# Resolve the Rust target triple (arg 1 overrides; else host).
TRIPLE="${1:-$(rustc -Vv | sed -n 's/host: //p')}"

case "$TRIPLE" in
  aarch64-apple-darwin)         ASSET="agent-browser-darwin-arm64" ;;
  x86_64-apple-darwin)          ASSET="agent-browser-darwin-x64" ;;
  x86_64-pc-windows-msvc)       ASSET="agent-browser-win32-x64.exe" ;;
  x86_64-unknown-linux-gnu)     ASSET="agent-browser-linux-x64" ;;
  aarch64-unknown-linux-gnu)    ASSET="agent-browser-linux-arm64" ;;
  *) echo "Unsupported triple for agent-browser: $TRIPLE" >&2; exit 1 ;;
esac

URL="https://github.com/vercel-labs/agent-browser/releases/download/v${AGENT_BROWSER_VERSION}/${ASSET}"
case "$TRIPLE" in
  *windows*) DEST="$OUT_DIR/agent-browser-$TRIPLE.exe" ;;
  *)         DEST="$OUT_DIR/agent-browser-$TRIPLE" ;;
esac

echo "Downloading $URL"
curl -fsSL "$URL" -o "$DEST"
chmod +x "$DEST"
echo "Placed sidecar for $TRIPLE at $DEST"
