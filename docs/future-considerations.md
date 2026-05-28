# Future considerations

Parking lot for ideas, libraries, and changes that are deliberately deferred.
Anything here is NOT in the current phase — see `phase-roadmap.md` for what
is. If something here becomes relevant, move it into a phase plan first.

## Apple Developer ID + notarization (macOS)

**Why deferred:** $99/yr Apple Developer Program enrollment + ~24-48h
approval delay. Current ad-hoc signing (`signingIdentity: "-"`) eliminates
the "damaged" error; testers can right-click → Open past the remaining
"unverified developer" warning. Acceptable for v0.1.x tester distribution.

**Activate when:** moving from invite-only testers to a public download
where one-click install matters, or when a tester refuses to right-click →
Open and asks you to "just fix it."

**Enrollment checklist:**

1. Enroll at developer.apple.com/programs (Individual or Organization).
   Approval is usually < 48 hours; bank-grade ID required.
2. In Xcode → Settings → Accounts, sign in with the Apple ID used for
   enrollment. Then "Manage Certificates…" → "+" → **Developer ID
   Application**. The certificate lands in your login keychain.
3. Note your **Team ID** (10 alphanumeric chars) at
   developer.apple.com/account → Membership.
4. Generate an **app-specific password** at appleid.apple.com →
   Sign-In & Security → App-Specific Passwords (label it "notarytool").
5. Export the four env vars before running `scripts/release.sh`:

   ```sh
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # the app-specific password
   export APPLE_TEAM_ID="TEAMID1234"
   ```

   The exact `signingIdentity` string can be copied from
   `security find-identity -v -p codesigning`.
6. Run `scripts/release.sh <version>`. `scripts/notarize.sh` detects the
   env vars, re-signs the `.app` and `.dmg` with hardened runtime, submits
   to Apple's notary service, waits for the result, and staples the
   ticket so Gatekeeper accepts it offline.
7. Verify: `xcrun stapler validate dist/*.dmg` reports `The validate
   action worked!`, and `spctl --assess --verbose=4 /Applications/
   QuantaMind.app` reports `accepted, source=Notarized Developer ID`.

**Known follow-ups if notarytool rejects:**

- "The signature does not include a secure timestamp" — add `--timestamp`
  to all `codesign` calls (already present in `notarize.sh`).
- "JIT not entitled" or similar WebView issue — add
  `com.apple.security.cs.allow-jit` to `backend/macos.entitlements`.
- "Hardened Runtime not enabled" — confirm `--options runtime` is on the
  `.app` codesign call (already present).

## scripts/release.sh exceeds 100-line file limit

`scripts/release.sh` is 138 lines after this change — pre-existing
violation of CLAUDE.md rule 3. Split into `release.sh` (orchestrator),
`scripts/bump-version.sh`, `scripts/build-bundle.sh`, and
`scripts/write-manifest.sh` in a dedicated refactor commit. No
behavior change; each split file <100 lines.

## Intel Mac build target

Current builds are `aarch64-apple-darwin` only. Intel users get a
"platform not found" error from the updater. Add `x86_64-apple-darwin`
target + universal-binary `lipo` step when an actual Intel tester
appears. Already noted in `release-process.md` gotchas.
