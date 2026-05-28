# Cross-platform builds (Windows + Linux)

v0.1 shipped macOS only, via the local `scripts/release.sh`. v0.2 adds a
GitHub Actions workflow that builds macOS, Windows, and Linux on a version
tag and attaches signed updater bundles to a draft GitHub Release.

## The workflow

`.github/workflows/release.yml` triggers on `v*` tags. Matrix:

| Runner | Output |
| --- | --- |
| `macos-14` | `.app` / `.dmg` (aarch64) |
| `windows-latest` | `.msi` + NSIS `.exe` (x64) |
| `ubuntu-22.04` | `.AppImage` + `.deb` (x64) |

It uses `tauri-apps/tauri-action@v0` with `projectPath: backend`
(`tauri.conf.json` lives there) and `includeUpdaterJson: true`, so a
combined `latest.json` covering all three platforms is produced in one
run. The release is created as a **draft** for manual review before
publishing.

## Required secrets

The workflow signs updater artifacts with the same minisign key as the
local flow. Add these repo secrets (Settings → Secrets → Actions):

- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/quantamind-updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password (blank if none)

Without them the `.sig` files won't validate against the pubkey baked
into `tauri.conf.json` and auto-update will reject the bundles.

## Bundle config

`tauri.conf.json` (`bundle`):
- `windows.webviewInstallMode: downloadBootstrapper` — the installer
  fetches WebView2 if missing (tiny installer, needs network on first run).
- `linux.deb.depends: [libwebkit2gtk-4.1-0, libgtk-3-0]` — runtime deps.

The Ubuntu runner also installs `libwebkit2gtk-4.1-dev` et al. at build
time (see the workflow's apt step).

## Updater manifest

Because CI builds all three platforms together, the generated
`latest.json` `platforms` map has `darwin-aarch64`, `windows-x86_64`, and
`linux-x86_64`. Publish that single file to
`https://quantamind.co/releases/latest.json` (the endpoint the app polls,
unchanged from v0.1) so every OS resolves its bundle.

## Windows is unsigned (for now)

The `.msi`/`.exe` are **not** code-signed, so Windows SmartScreen shows
"Windows protected your PC" on first launch. Users click **More info →
Run anyway**. Document this on the download page. A signing cert is
tracked in `future-considerations.md`.

Linux AppImage/deb need no signing.

## Verification

- Workflow is valid YAML and uses the standard `tauri-action` matrix
  (validated structurally; a real run requires pushing a tag).
- Manual: push a `vX.Y.Z` tag, confirm the draft release gets six+
  artifacts, install the `.msi` on Windows 11 and the `.deb`/`.AppImage`
  on Ubuntu 24.04, and run one prompt on each.
