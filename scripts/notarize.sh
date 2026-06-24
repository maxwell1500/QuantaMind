#!/usr/bin/env bash
# QuantaMind: Apple Developer ID signing + notarization.
#
# Usage:  scripts/notarize.sh <dmg-path>
#
# Env-gated. If the four required vars aren't all set, this script is a clean
# no-op (exit 0) — safe to call from release.sh before you have an Apple Dev
# account. When all four are set, it re-signs the .app and .dmg with the
# Developer ID, submits the DMG to Apple's notary service, waits for the
# result, and staples the ticket so Gatekeeper accepts offline.
#
# Required env vars:
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: Name (TEAMID)"
#   APPLE_ID                 Apple ID email
#   APPLE_PASSWORD           App-specific password (appleid.apple.com)
#   APPLE_TEAM_ID            10-char team identifier

set -euo pipefail

DMG_PATH="${1:-}"
if [[ -z "$DMG_PATH" ]]; then
  echo "usage: $0 <dmg-path>" >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" \
   || -z "${APPLE_ID:-}" \
   || -z "${APPLE_PASSWORD:-}" \
   || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo "notarize.sh: no Dev ID credentials in env, skipping (DMG ships ad-hoc)."
  exit 0
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "notarize.sh: DMG not found at $DMG_PATH" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTITLEMENTS="${REPO_ROOT}/backend/macos.entitlements"
BUNDLE_DIR="${REPO_ROOT}/backend/target/aarch64-apple-darwin/release/bundle/macos"
APP_PATH="$(ls -d "${BUNDLE_DIR}"/*.app 2>/dev/null | head -n1)"

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "notarize.sh: .app not found under ${BUNDLE_DIR}" >&2
  exit 3
fi

echo "==> Re-signing .app with Developer ID + hardened runtime"
codesign --force --options runtime \
  --entitlements "$ENTITLEMENTS" \
  --sign "$APPLE_SIGNING_IDENTITY" --deep --timestamp \
  "$APP_PATH"

echo "==> Re-signing .dmg"
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG_PATH"

echo "==> Submitting to notarytool (this can take several minutes)"
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "==> Stapling ticket"
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"

echo "==> Notarization complete: $DMG_PATH"
