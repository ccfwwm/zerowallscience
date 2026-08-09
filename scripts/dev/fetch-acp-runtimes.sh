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
# Windows npm does not understand Git Bash's synthetic `/tmp` mapping. Keep the
# release scratch directory below the repository root so MSYS converts it to an
# existing drive path before `npm pack` receives it.
TMP="$(mktemp -d "$ROOT/.acp-runtime.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

case "$TRIPLE" in
  x86_64-pc-windows-msvc) NODE_ASSET="node-v${NODE_VERSION}-win-x64.zip"; NODE_DIR="node-v${NODE_VERSION}-win-x64"; NODE_EXECUTABLE="node.exe"; NODE_ARCH="x64"; EXT=".cmd" ;;
  aarch64-pc-windows-msvc) NODE_ASSET="node-v${NODE_VERSION}-win-arm64.zip"; NODE_DIR="node-v${NODE_VERSION}-win-arm64"; NODE_EXECUTABLE="node.exe"; NODE_ARCH="arm64"; EXT=".cmd" ;;
  x86_64-apple-darwin) NODE_ASSET="node-v${NODE_VERSION}-darwin-x64.tar.gz"; NODE_DIR="node-v${NODE_VERSION}-darwin-x64"; NODE_EXECUTABLE="bin/node"; NODE_ARCH="x64"; EXT="" ;;
  aarch64-apple-darwin) NODE_ASSET="node-v${NODE_VERSION}-darwin-arm64.tar.gz"; NODE_DIR="node-v${NODE_VERSION}-darwin-arm64"; NODE_EXECUTABLE="bin/node"; NODE_ARCH="arm64"; EXT="" ;;
  x86_64-unknown-linux-gnu) NODE_ASSET="node-v${NODE_VERSION}-linux-x64.tar.xz"; NODE_DIR="node-v${NODE_VERSION}-linux-x64"; NODE_EXECUTABLE="bin/node"; NODE_ARCH="x64"; EXT="" ;;
  aarch64-unknown-linux-gnu) NODE_ASSET="node-v${NODE_VERSION}-linux-arm64.tar.xz"; NODE_DIR="node-v${NODE_VERSION}-linux-arm64"; NODE_EXECUTABLE="bin/node"; NODE_ARCH="arm64"; EXT="" ;;
  *) echo "Unsupported target: $TRIPLE" >&2; exit 1 ;;
esac

NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ASSET}"
ARCHIVE="$TMP/$NODE_ASSET"
node_runtime_is_ready() {
  local profile executable actual
  for profile in claude-code codex; do
    executable="$OUT/$profile/node/$NODE_EXECUTABLE"
    [[ -f "$executable" ]] || return 1
    actual="$("$executable" -p "process.version + ' ' + process.arch" 2>/dev/null || true)"
    [[ "$actual" == "v${NODE_VERSION} ${NODE_ARCH}" ]] || return 1
  done
}

if node_runtime_is_ready; then
  echo "Reusing the prepared Node runtime v${NODE_VERSION} (${NODE_ARCH})"
else
  curl \
    --fail \
    --location \
    --connect-timeout 20 \
    --speed-limit 1024 \
    --speed-time 30 \
    --max-time 600 \
    --retry 3 \
    --retry-all-errors \
    --continue-at - \
    --output "$ARCHIVE" \
    "$NODE_URL"
  case "$NODE_ASSET" in
    *.zip) unzip -q "$ARCHIVE" -d "$TMP" ;;
    *.tar.gz) tar -xzf "$ARCHIVE" -C "$TMP" ;;
    *.tar.xz) tar -xJf "$ARCHIVE" -C "$TMP" ;;
  esac

  for profile in claude-code codex; do
    mkdir -p "$OUT/$profile/bin" "$OUT/$profile/node"
    cp -R "$TMP/$NODE_DIR/." "$OUT/$profile/node/"
  done
fi

# npm pack is run only by the release preparation job. Use the host npm that
# belongs to the host Node executable, not a PATH shim left by a Windows Node
# installer. WSL commonly exposes such a shim even though `node` is native
# Linux; that shim converts `/mnt/c` paths into invalid `C:\mnt\c` paths.
HOST_NODE="$(command -v node || true)"
if [[ -z "$HOST_NODE" ]]; then
  echo "A host Node.js installation is required for npm pack during release preparation" >&2
  exit 1
fi
HOST_NPM="$(dirname "$(readlink -f "$HOST_NODE")")/npm"
if [[ ! -x "$HOST_NPM" ]]; then HOST_NPM="$(command -v npm)"; fi
for spec in "@anthropic-ai/claude-code@$CLAUDE_VERSION" "@openai/codex@$CODEX_VERSION"; do
  "$HOST_NPM" pack "$spec" --pack-destination "$TMP" >/dev/null
done
"$HOST_NPM" pack "@anthropic-ai/claude-code-win32-x64@$CLAUDE_VERSION" --pack-destination "$TMP" >/dev/null
"$HOST_NPM" pack "@openai/codex@${CODEX_VERSION}-win32-x64" --pack-destination "$TMP" >/dev/null

tar -xzf "$TMP/anthropic-ai-claude-code-$CLAUDE_VERSION.tgz" -C "$OUT/claude-code"
tar -xzf "$TMP/openai-codex-$CODEX_VERSION.tgz" -C "$OUT/codex"
mkdir -p "$OUT/claude-code/package/node_modules/@anthropic-ai/claude-code-win32-x64"
mkdir -p "$OUT/codex/package/node_modules/@openai/codex-win32-x64"
tar -xzf "$TMP/anthropic-ai-claude-code-win32-x64-$CLAUDE_VERSION.tgz" \
  --strip-components=1 -C "$OUT/claude-code/package/node_modules/@anthropic-ai/claude-code-win32-x64"
tar -xzf "$TMP/openai-codex-${CODEX_VERSION}-win32-x64.tgz" \
  --strip-components=1 -C "$OUT/codex/package/node_modules/@openai/codex-win32-x64"

if [[ "$EXT" == ".cmd" ]]; then
  cat > "$OUT/claude-code/bin/claude${EXT}" <<'WRAPPER'
@echo off
set "ROOT=%~dp0.."
"%ROOT%\node\node.exe" "%ROOT%\package\cli-wrapper.cjs" %*
WRAPPER
  cat > "$OUT/codex/bin/codex${EXT}" <<'WRAPPER'
@echo off
set "ROOT=%~dp0.."
"%ROOT%\node\node.exe" "%ROOT%\package\bin\codex.js" %*
WRAPPER
else
  cat > "$OUT/claude-code/bin/claude" <<'WRAPPER'
#!/usr/bin/env sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec "$ROOT/node/bin/node" "$ROOT/package/cli.js" "$@"
WRAPPER
  cat > "$OUT/codex/bin/codex" <<'WRAPPER'
#!/usr/bin/env sh
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
exec "$ROOT/node/bin/node" "$ROOT/package/bin/codex.js" "$@"
WRAPPER
  chmod +x "$OUT"/*/bin/*
fi

echo "Prepared pinned ACP CLI runtimes in $OUT for $TRIPLE"
