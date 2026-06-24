#!/usr/bin/env bash
# Fetch the bundled llama-server sidecar for the host platform (Step 3.2).
# Binaries are NOT committed (see .gitignore); run this before `tauri build`
# or local llama.cpp verification. Pinned for reproducibility.
set -euo pipefail

LLAMA_BUILD="${LLAMA_BUILD:-b9386}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/backend/binaries"
TRIPLE="$(rustc -vV | sed -n 's/host: //p')"

case "$TRIPLE" in
  aarch64-apple-darwin) ASSET="llama-${LLAMA_BUILD}-bin-macos-arm64.tar.gz" ;;
  x86_64-apple-darwin)  ASSET="llama-${LLAMA_BUILD}-bin-macos-x64.tar.gz" ;;
  x86_64-unknown-linux-gnu) ASSET="llama-${LLAMA_BUILD}-bin-ubuntu-x64.tar.gz" ;;
  aarch64-unknown-linux-gnu) ASSET="llama-${LLAMA_BUILD}-bin-ubuntu-arm64.tar.gz" ;;
  *)
    echo "No pinned llama-server asset for $TRIPLE yet — see docs/cross-platform-builds.md" >&2
    exit 1 ;;
esac

URL="https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_BUILD}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $ASSET ..."
curl -fsSL "$URL" -o "$TMP/llama.tar.gz"
tar -xzf "$TMP/llama.tar.gz" -C "$TMP"

BIN="$(find "$TMP" -type f -name llama-server | head -n1)"
[ -n "$BIN" ] || { echo "llama-server not found in archive" >&2; exit 1; }

mkdir -p "$DEST"
# Copy any sibling shared libraries (dylib on macOS, so on Linux).
cp "$(dirname "$BIN")"/*.dylib "$DEST"/ 2>/dev/null || true
cp "$(dirname "$BIN")"/*.so "$DEST"/ 2>/dev/null || true
cp "$BIN" "$DEST/llama-server"
chmod +x "$DEST/llama-server"
echo "Installed $DEST/llama-server (build $LLAMA_BUILD, $TRIPLE)"
