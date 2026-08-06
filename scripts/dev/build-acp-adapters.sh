#!/usr/bin/env bash
# Build the pinned ACP adapters used by Tauri. This is a release-only build
# step: application startup never downloads packages or launches npx.
set -euo pipefail

CLAUDE_ACP_VERSION="0.16.1"
CODEX_ACP_VERSION="1.1.9"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TRIPLE="${1:-$(rustc -Vv | sed -n 's/^host: //p')}"
OUT="$ROOT/apps/desktop/src-tauri/binaries"
PATCH="$ROOT/scripts/patches/claude-code-acp-usage.patch"
TMP="$(mktemp -d "$ROOT/.acp-adapter.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

case "$TRIPLE" in
  x86_64-pc-windows-msvc) BUN_TARGET="windows-x64-baseline"; SUFFIX=".exe" ;;
  aarch64-pc-windows-msvc) BUN_TARGET="windows-arm64"; SUFFIX=".exe" ;;
  x86_64-apple-darwin) BUN_TARGET="darwin-x64-baseline"; SUFFIX="" ;;
  aarch64-apple-darwin) BUN_TARGET="darwin-arm64"; SUFFIX="" ;;
  x86_64-unknown-linux-gnu) BUN_TARGET="linux-x64-baseline"; SUFFIX="" ;;
  aarch64-unknown-linux-gnu) BUN_TARGET="linux-arm64"; SUFFIX="" ;;
  *) echo "Unsupported target: $TRIPLE" >&2; exit 1 ;;
esac

BUN="${BUN_EXECUTABLE:-$(command -v bun 2>/dev/null || command -v bun.exe 2>/dev/null || true)}"
[[ -n "$BUN" ]] || { echo "Bun is required to build ACP adapters" >&2; exit 1; }
mkdir -p "$OUT"
git clone --depth 1 --branch "v$CLAUDE_ACP_VERSION" https://github.com/zed-industries/claude-code-acp.git "$TMP/claude"
git -C "$TMP/claude" apply "$PATCH"
(cd "$TMP/claude" && npm ci && npm run test:run -- src/tests/acp-agent.test.ts && npm run build && \
  "$BUN" build src/index.ts --minify --compile --target="bun-$BUN_TARGET" --outfile "dist/bin/claude-code-acp$SUFFIX" && \
  cp "dist/bin/claude-code-acp$SUFFIX" "$OUT/claude-code-acp-$TRIPLE$SUFFIX")

git clone --depth 1 --branch "v$CODEX_ACP_VERSION" https://github.com/agentclientprotocol/codex-acp.git "$TMP/codex"
# The upstream suite has POSIX-path fixtures which fail under Windows even
# though the compiled adapter is platform-correct. Its own CI runs that suite
# on Linux; the desktop CI typechecks and packages the Windows binary here.
(cd "$TMP/codex" && npm ci && npm run build && \
  "$BUN" build src/index.ts --minify --compile --target="bun-$BUN_TARGET" --outfile "dist/bin/codex-acp$SUFFIX" && \
  cp "dist/bin/codex-acp$SUFFIX" "$OUT/codex-acp-$TRIPLE$SUFFIX")

echo "Built pinned ACP adapters for $TRIPLE"
