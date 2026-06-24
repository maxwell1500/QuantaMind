#!/usr/bin/env bash
# QuantaMind release orchestrator.
#
# Usage:  scripts/release.sh <new-version>     e.g.  scripts/release.sh 0.1.1
#   Or:   scripts/release.sh <new-version> --target x86_64-unknown-linux-gnu
#
# Walks: bump → test → build (signed) → manifest → upload-hint → tag.
# Idempotent — safe to re-run after a partial failure.
#
# Prerequisites (one-time):
#   1. Generate the updater signing key pair:
#        mkdir -p ~/.tauri
#        pnpm --dir=frontend exec tauri signer generate -w ~/.tauri/quantamind-updater.key
#      Back up the .key file (1Password). Paste the printed PUBLIC KEY into
#      backend/tauri.conf.json under plugins.updater.pubkey, then commit.
#   2. Set release notes in RELEASE_NOTES.md (top section is read for the
#      release being cut).

set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: $0 <new-version> [--target <triple>]" >&2
  echo "       If --target is omitted, defaults to the host triple." >&2
  exit 1
fi
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: version must be MAJOR.MINOR.PATCH (got: $VERSION)" >&2
  exit 1
fi

TARGET="${3:-$(rustc -vV | sed -n 's/host: //p')}"
# Map TARGET to Tauri's platform key used in latest.json
case "$TARGET" in
  aarch64-apple-darwin)   PLATFORM="darwin-aarch64" ;;
  x86_64-apple-darwin)    PLATFORM="darwin-x86_64" ;;
  x86_64-unknown-linux-gnu) PLATFORM="linux-x86_64" ;;
  aarch64-unknown-linux-gnu) PLATFORM="linux-aarch64" ;;
  *)
    echo "warning: unrecognised target $TARGET — using as platform key verbatim" >&2
    PLATFORM="$TARGET" ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

KEY_PATH="${TAURI_KEY_PATH:-$HOME/.tauri/quantamind-updater.key}"
NOTES_FILE="${REPO_ROOT}/RELEASE_NOTES.md"

# ------ 1. Bump version everywhere ------
echo "==> Bumping version to ${VERSION} in 3 manifests"
sed -i.bak -E "0,/^version = \"[0-9]+\\.[0-9]+\\.[0-9]+\"$/{s//version = \"${VERSION}\"/;}" backend/Cargo.toml
sed -i.bak -E "s/\"version\": *\"[0-9]+\\.[0-9]+\\.[0-9]+\"/\"version\": \"${VERSION}\"/" backend/tauri.conf.json
sed -i.bak -E "s/\"version\": *\"[0-9]+\\.[0-9]+\\.[0-9]+\"/\"version\": \"${VERSION}\"/" frontend/package.json
rm -f backend/Cargo.toml.bak backend/tauri.conf.json.bak frontend/package.json.bak

( cd backend && cargo update -p quantamind --offline 2>/dev/null || cargo check --offline 2>/dev/null || true )

# ------ 2. Tests ------
echo "==> Running backend tests"
( cd backend && cargo test --lib --color=never )
echo "==> Running frontend tests"
( cd frontend && pnpm test )

# ------ 3. Signed build ------
if [[ ! -f "$KEY_PATH" ]]; then
  echo "error: signing key not found at ${KEY_PATH}." >&2
  echo "       Run 'pnpm --dir=frontend exec tauri signer generate -w ${KEY_PATH}' first." >&2
  exit 2
fi

echo "==> Building signed bundle for ${TARGET} (this can take a few minutes)"
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
( cd frontend && pnpm tauri build --target "$TARGET" )

# ------ 4. Collect artifacts ------
BUNDLE_DIR="${REPO_ROOT}/backend/target/${TARGET}/release/bundle"
case "$PLATFORM" in
  darwin-*)
    TARGZ_PATH="$(ls "${BUNDLE_DIR}/macos/"*.app.tar.gz | head -n1)"
    SIG_PATH="${TARGZ_PATH}.sig"
    DMG_PATH="$(ls "${BUNDLE_DIR}/dmg/"*.dmg | head -n1)"
    if [[ ! -f "$TARGZ_PATH" || ! -f "$SIG_PATH" || ! -f "$DMG_PATH" ]]; then
      echo "error: expected macOS bundle artifacts missing under ${BUNDLE_DIR}" >&2
      ls -la "${BUNDLE_DIR}"/{macos,dmg} 2>/dev/null >&2 || true
      exit 3
    fi
    DMG_NAME="$(basename "$DMG_PATH")"
    ;;
  linux-*)
    # Tauri produces .deb and .AppImage on Linux
    APPIMAGE_PATH="$(ls "${BUNDLE_DIR}/appimage/"*.AppImage 2>/dev/null | head -n1)"
    DEB_PATH="$(ls "${BUNDLE_DIR}/deb/"*.deb 2>/dev/null | head -n1)"
    # The updater uses the .tar.gz
    TARGZ_PATH="$(ls "${BUNDLE_DIR}/appimage/"*.tar.gz 2>/dev/null | head -n1)"
    if [[ -z "$TARGZ_PATH" && -n "$APPIMAGE_PATH" ]]; then
      echo "warning: no .tar.gz found; updater bundle may not be available" >&2
    fi
    SIG_PATH="${TARGZ_PATH}.sig"
    ;;
esac

SIG_CONTENTS=""
if [[ -f "$SIG_PATH" ]]; then
  SIG_CONTENTS="$(cat "$SIG_PATH")"
fi
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
NOTES="$(awk -v v="${VERSION}" '
  /^## / { if (found) { exit } if ($2 == v) { found=1; next } }
  found { print }
' "${NOTES_FILE}" 2>/dev/null || echo "Release ${VERSION}.")"
NOTES="${NOTES:-Release ${VERSION}.}"

DIST_DIR="${REPO_ROOT}/dist"
mkdir -p "${DIST_DIR}"

# Copy artifacts to dist/
if [[ -n "${TARGZ_PATH:-}" && -f "$TARGZ_PATH" ]]; then
  cp "$TARGZ_PATH" "${DIST_DIR}/"
  TARGZ_NAME="$(basename "$TARGZ_PATH")"
  if [[ -f "$SIG_PATH" ]]; then
    cp "$SIG_PATH" "${DIST_DIR}/"
  fi
fi
if [[ -n "${DMG_PATH:-}" && -f "$DMG_PATH" ]]; then
  cp "$DMG_PATH" "${DIST_DIR}/"
fi
if [[ -n "${DEB_PATH:-}" && -f "$DEB_PATH" ]]; then
  cp "$DEB_PATH" "${DIST_DIR}/"
fi
if [[ -n "${APPIMAGE_PATH:-}" && -f "$APPIMAGE_PATH" ]]; then
  cp "$APPIMAGE_PATH" "${DIST_DIR}/"
fi

# ------ 5. Generate / update latest.json ------
# Merge with any existing latest.json so multiple target builds accumulate
LATEST_JSON="${DIST_DIR}/latest.json"
if [[ -f "$LATEST_JSON" ]]; then
  EXISTING="$(cat "$LATEST_JSON")"
else
  EXISTING='{"version":"'"${VERSION}"'","notes":"'"${NOTES}"'","pub_date":"'"${PUB_DATE}"'","platforms":{}}'
fi

python3 -c "
import json, os
existing = json.loads('''${EXISTING}''')
existing['version'] = '${VERSION}'
existing['notes'] = '''${NOTES}'''
existing['pub_date'] = '${PUB_DATE}'
entry = {}
${SIG_CONTENTS:+ entry['signature'] = '''${SIG_CONTENTS}'''}
${TARGZ_NAME:+ entry['url'] = 'https://quantamind.co/releases/${TARGZ_NAME}'}
if entry:
    existing.setdefault('platforms', {})['${PLATFORM}'] = entry
with open('${LATEST_JSON}', 'w') as f:
    json.dump(existing, f, indent=2)
"

echo "==> Artifacts staged in ${DIST_DIR}:"
ls -la "${DIST_DIR}"

# ------ 6. Upload reminder ------
cat <<EOF

==> Upload these files to https://quantamind.co/releases/ :

EOF

for f in "${DIST_DIR}"/*; do
  echo "      $(basename "$f")"
done

cat <<EOF

    Whatever transport you use (scp, rsync, S3 sync, Vercel CLI), all files
    must end up at:

      https://quantamind.co/releases/<filename>

    The latest.json's "url" fields already encode that path.

EOF

# ------ 7. Notarize (macOS only, no-op unless Apple Dev ID env vars are set) ------
if [[ -n "${DMG_PATH:-}" && -f "$DMG_PATH" ]]; then
  bash "${REPO_ROOT}/scripts/notarize.sh" "$DMG_PATH" || {
    echo "warning: notarization step failed or skipped — DMG ships unnotarized." >&2
  }
fi

# ------ 8. Git tag (optional — only after upload + smoke test) ------
echo "==> Once the upload is verified and you've installed the update on a"
echo "    test machine, tag the release:"
echo "       git tag v${VERSION} && git push origin v${VERSION}"
