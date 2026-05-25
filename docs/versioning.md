# Versioning

QuantaMind follows **SemVer** — `MAJOR.MINOR.PATCH`, no leading `v`,
synchronised across three files (`backend/Cargo.toml`,
`backend/tauri.conf.json`, `frontend/package.json`). The release
script bumps all three for you.

## Bump rules

| Bump | When | Examples |
| --- | --- | --- |
| `PATCH` (`0.1.0` → `0.1.1`) | Bug fixes only. No new user-visible features, no behavioural changes. | Fixing the Refresh button silent flash. Bumping a sub-1s health probe timeout. Correcting a doc typo. |
| `MINOR` (`0.1.x` → `0.2.0`) | New features, additive changes, anything that needs a paragraph in the release notes. | Adding the Help tab. Adding mailto feedback. Adding per-model temperature persistence. |
| `MAJOR` (`0.x.y` → `1.0.0`) | Breaking changes, or the "we're stable now" promise. | First non-alpha cut. A schema migration that breaks downgrade. |

## Pre-1.0 special case

Below `1.0.0` the convention is "any MINOR bump may break things"
without the user being entitled to complain. That's standard SemVer
practice for alpha/beta software. **Don't sweat backwards
compatibility until you ship `1.0.0`.**

`1.0.0` should land when:

- The core flows (Workspace run, Compare run, Models install,
  Storage) are stable enough that you'd be embarrassed to break them
  in a `0.x.0` bump.
- The on-disk formats (`model_settings.yaml`, anything you persist)
  have been stable for at least one release cycle.
- The IPC surface is something you'd commit to maintaining.

## Pre-release / RC versions

If you want to ship a release candidate or beta:

- `0.2.0-rc.1`, `0.2.0-beta.2`, etc. SemVer's pre-release suffix
  syntax. The updater plugin handles them correctly — a `0.2.0-rc.1`
  install will see a `0.2.0` release as newer.
- Pre-release tags should never go in the stable `latest.json`. Host
  them under a separate channel manifest if you want a beta track
  later (out of scope for v0.1.0).

## Don't do this

- **No git-sha versions in shipped builds.** Reproducible
  `MAJOR.MINOR.PATCH` only.
- **No skipping versions.** `0.1.0` → `0.1.2` is confusing for users
  trying to read the changelog. Skip a number only if you accidentally
  burned one on a botched release (rare).
- **No `+build.123` build-metadata in user-facing version strings.**
  SemVer allows it but the in-app version display doesn't render it
  meaningfully.
