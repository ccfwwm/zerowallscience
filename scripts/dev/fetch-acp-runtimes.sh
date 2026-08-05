#!/usr/bin/env bash
# Fetch the pinned, app-private ACP CLI runtimes. This is a release-build
# input: the application never runs npm, npx, or a network request at launch.
set -euo pipefail

NODE_VERSION="24.9.0"
CODEX_VERSION="0.146.0"
CLAUDE_VERSION="2.1.222"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ACP_RUNTIME_OUT:-$ROOT/runtime/acp}"
TRIPLE="${1:-$(rustc -Vv | sed -n 's/^host: //p')}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$TRIPLE" in
  x86_64-pc-windows-msvc) NODE_ASSET="node-v${NODE_VERSION}-win-x64.zip"; NODE_DIR="node-v${NODE_VERSION}-win-x64"; EXT=".exe" ;;
  aarch64-pc-windows-msvc) NODE_ASSET="node-v${NODE_VERSION}-win-arm64.zip"; NODE_DIR="node-v${NODE_VERSION}-win-arm64"; EXT=".exe" ;;
  x86_64-apple-darwin) NODE_ASSET="node-v${NODE_VERSION}-darwin-x64.tar.gz"; NODE_DIR="node-v${NODE_VERSION}-darwin-x64"; EXT="" ;;
  aarch64-apple-darwin) NODE_ASSET="node-v${NODE_VERSION}-darwin-arm64.tar.gz"; NODE_DIR="node-v${NODE_VERSION}-darwin-arm64"; EXT="" ;;
  x86_64-unknown-linux-gnu) NODE_ASSET="node-v${NODE_VERSION}-linux-x64.tar.xz"; NODE_DIR="node-v${NODE_VERSION}-linux-x64"; EXT="" ;;
  aarch64-unknown-linux-gnu) NODE_ASSET="node-v${NODE_VERSION}-linux-arm64.tar.xz"; NODE_DIR="node-v${NODE_VERSION}-linux-arm64"; EXT="" ;;
  *) echo "Unsupported target: $TRIPLE" >&2; exit 1 ;;
esac

NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ASSET}"
ARCHIVE="$TMP/$NODE_ASSET"
curl --fail --location --retry 3 --output "$ARCHIVE" "$NODE_URL"
case "$NODE_ASSET" in
  *.zip) unzip -q "$ARCHIVE" -d "$TMP" ;;
  *.tar.gz) tar -xzf "$ARCHIVE" -C "$TMP" ;;
  *.tar.xz) tar -xJf "$ARCHIVE" -C "$TMP" ;;
esac

for profile in claude-code codex; do
  mkdir -p "$OUT/$profile/bin" "$OUT/$profile/node"
  cp -R "$TMP/$NODE_DIR/." "$OUT/$profile/node/"
done

# npm pack is run only by the release preparation job. The resulting package
# trees are copied into the app-private runtime; no global npm state is used.
NPM_BIN="$OUT/claude-code/node/bin/npm"
if [[ "$TRIPLE" == *windows* ]]; then NPM_BIN="$OUT/claude-code/node/npm.cmd"; fi
for spec in "@anthropic-ai/claude-code@$CLAUDE_VERSION" "@openai/codex@$CODEX_VERSION"; do
  npm pack "$spec" --pack-destination "$TMP" >/dev/null
done

tar -xzf "$TMP/claude-code-$CLAUDE_VERSION.tgz" -C "$OUT/claude-code"
tar -xzf "$TMP/codex-$CODEX_VERSION.tgz" -C "$OUT/codex"

cat > "$OUT/claude-code/bin/claude${EXT}" <<'WRAPPER'
#!/usr/bin/env sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec "$ROOT/node/bin/node" "$ROOT/package/cli.js" "$@"
WRAPPER
cat > "$OUT/codex/bin/codex${EXT}" <<'WRAPPER'
#!/usr/bin/env sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec "$ROOT/node/bin/node" "$ROOT/package/bin/codex.js" "$@"
WRAPPER
if [[ "$EXT" == "" ]]; then chmod +x "$OUT"/*/bin/*; fi

echo "Prepared pinned ACP CLI runtimes in $OUT for $TRIPLE"
