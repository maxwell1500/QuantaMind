# Release process

How to cut a new QuantaMind release that existing installs can
auto-update to. Read this top-to-bottom the first time. After that,
the `scripts/release.sh` script automates most of it.

## One-time setup (do once, ever)

You're shipping a signed update bundle. The signature uses a key pair
you generate locally. The **public** key gets embedded in the app at
build time; the **private** key signs each release. **If the private
key is ever lost, every existing install is permanently disconnected
from auto-updates** (manifests signed with a new key won't validate
against the old embedded public key). Treat it like the recovery seed
of a crypto wallet.

```sh
# 1. Generate the key pair (one prompt — leave the password blank
#    unless you want to type it on every build).
mkdir -p ~/.tauri
pnpm --dir=frontend exec tauri signer generate -w ~/.tauri/quantamind-updater.key

# 2. The PUBLIC KEY is printed to stdout. Copy it.

# 3. Paste it into backend/tauri.conf.json, replacing the placeholder
#    string under plugins.updater.pubkey :
#
#      "plugins": {
#        "updater": {
#          "endpoints": [...],
#          "pubkey": "<paste here>"
#        }
#      }

# 4. Commit + push the new tauri.conf.json. The public key is safe
#    to commit — it's the private key that's sensitive.

# 5. Back up ~/.tauri/quantamind-updater.key off your laptop:
#      - 1Password secure note (recommended)
#      - encrypted USB stick stored separately
#      - whatever — just two copies in different physical places
```

## Per-release recipe

For every release after v0.1.0:

```sh
# 1. Make sure main is clean and you've merged everything you want
#    to ship.
git checkout main && git pull && git status

# 2. Write release notes. Open RELEASE_NOTES.md and add a new section
#    at the top:
#
#      ## 0.1.1
#      Bug fixes:
#      - Refresh button now shows visible feedback on click.
#      - …
#
#    Keep it short (≤ 6 lines). This is what the user sees in the
#    update dialog.

# 3. Pick the new version per docs/versioning.md.

# 4. Run the release script.
scripts/release.sh 0.1.1

#    What it does for you:
#    - Bumps version in Cargo.toml + tauri.conf.json + package.json
#    - Runs the full test suite (refuses to proceed on failure)
#    - Builds the signed bundle (~3 minutes on M-series Mac)
#    - Generates dist/latest.json from the build output
#    - Copies the .dmg, .app.tar.gz, .app.tar.gz.sig, latest.json
#      into dist/ and prints the upload hint
```

The script staging finishes with `dist/` containing four files:

```
dist/
├── QuantaMind_0.1.1_aarch64.dmg          ← fresh-install download
├── QuantaMind.app.tar.gz                 ← auto-update bundle
├── QuantaMind.app.tar.gz.sig             ← signature (MUST stay at <bundle>.sig)
└── latest.json                            ← manifest the app polls
```

## Upload

Upload all four files to `https://quantamind.co/releases/` — whatever
transport you use (scp, rsync, S3 sync, Cloudflare R2 upload, Vercel
CLI):

```sh
# Example with scp; replace with whatever your site deploy uses.
scp dist/*.{dmg,gz,sig,json} user@quantamind.co:/var/www/releases/
```

The four required URLs after upload, all HTTPS:

- `https://quantamind.co/releases/latest.json`
- `https://quantamind.co/releases/QuantaMind.app.tar.gz`
- `https://quantamind.co/releases/QuantaMind.app.tar.gz.sig`
- `https://quantamind.co/releases/QuantaMind_<ver>_aarch64.dmg`

Sanity-check by `curl`-ing the manifest from another machine — it
should return JSON, not HTML.

## Smoke test the update flow

1. Install the **previous** version on a clean Mac (or a fresh
   throwaway VM / a second account).
2. Open QuantaMind → Help tab → Check for updates.
3. Should report the new version with the notes you wrote.
4. Click Download and install.
5. App relaunches into the new version. The Help tab now reads
   "You're on v0.1.1" (or whatever).
6. Open the Workspace and run one prompt to confirm nothing's broken.

Only after the smoke test passes do you commit the tag:

```sh
git add backend/Cargo.toml backend/tauri.conf.json frontend/package.json \
        backend/Cargo.lock RELEASE_NOTES.md
git commit -m "release: 0.1.1"
git tag v0.1.1 && git push origin main v0.1.1
```

## Rollback

If a release ships broken and users are upgrading into it:

1. Re-upload the *previous* release's `latest.json` to
   `https://quantamind.co/releases/latest.json` (overwriting the
   broken one). New "Check for updates" calls will now see the older
   version and report "up to date."
2. Anyone who has *already* installed the broken version is on it
   until you cut a fix. Push the fix as a higher-version release
   (`0.1.2`, even if `0.1.1` is the one that was bad — never re-use
   version numbers).

## Gotchas

- **No code signing in v0.1.0.** macOS Gatekeeper will warn
  "QuantaMind can't be opened because Apple cannot check it for
  malicious software" on the first launch after each update. The
  user has to right-click → Open. Add a note to your website's
  download page explaining this. The fix is an Apple Developer ID +
  notarization (~$99/yr); when you're ready, add the `--sign` flag
  to the build step and the notarize step to the script.

- **The endpoint URL is baked at build time.** If you ever move
  `quantamind.co/releases/` to a CDN or a new domain, you have to
  cut a new release with the new URL in `tauri.conf.json`. Old
  installs will keep polling the old URL until they manually
  re-install.

- **Manifest must have the matching architecture entry.** If you
  build only `aarch64-apple-darwin`, the manifest's `platforms` map
  has only `darwin-aarch64`. An Intel Mac install will get a
  "platform not found" error from `check()`. Either ship a universal
  build or add an Intel build target.

- **`<bundle>.app.tar.gz.sig` must live next to `.app.tar.gz`.** The
  updater hashes the URL from the manifest, looks for `<url>.sig`,
  and downloads that. Filename collisions or moving the sig file
  separately will break verification.

- **`tauri signer generate` with a password.** If you set one,
  export `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` before running the
  release script (the script reads it). Otherwise the build fails
  with a cryptic "incorrect password" error.

See `docs/versioning.md` for the SemVer policy.
