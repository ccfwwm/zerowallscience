#!/usr/bin/env bash
# Fetch the pinned uv binary as a Tauri sidecar
# (apps/desktop/src-tauri/binaries/uv-<target-triple>). uv provisions the
# isolated Jupyter environment for the Jupyter MCP integration on demand.
set -euo pipefail

UV_VERSION="${UV_VERSION:-0.11.26}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT/apps/desktop/src-tauri/binaries"
mkdir -p "$OUT_DIR"

TRIPLE="${1:-$(rustc -Vv | sed -n 's/host: //p')}"

case "$TRIPLE" in
  aarch64-apple-darwin | x86_64-apple-darwin) ASSET="uv-$TRIPLE.tar.gz" ;;
  x86_64-unknown-linux-gnu | aarch64-unknown-linux-gnu) ASSET="uv-$TRIPLE.tar.gz" ;;
  x86_64-pc-windows-msvc | aarch64-pc-windows-msvc) ASSET="uv-$TRIPLE.zip" ;;
  *) echo "Unsupported triple: $TRIPLE" >&2; exit 1 ;;
esac

URL="https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${ASSET}"
TMP="$(mktemp -d)"
echo "Downloading $URL"
curl -fsSL "$URL" -o "$TMP/$ASSET"
case "$ASSET" in
  *.tar.gz) tar -xzf "$TMP/$ASSET" -C "$TMP" ;;
  *.zip) unzip -oq "$TMP/$ASSET" -d "$TMP" ;;
esac

if [ -f "$TMP/uv.exe" ] || find "$TMP" -name uv.exe | grep -q .; then
  BIN="$(find "$TMP" -type f -name uv.exe | head -1)"
  cp "$BIN" "$OUT_DIR/uv-$TRIPLE.exe"
else
  BIN="$(find "$TMP" -type f -name uv | head -1)"
  cp "$BIN" "$OUT_DIR/uv-$TRIPLE"
  chmod +x "$OUT_DIR/uv-$TRIPLE"
fi
rm -rf "$TMP"
echo "Placed uv sidecar for $TRIPLE in $OUT_DIR"
