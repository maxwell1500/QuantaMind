# Release notes

Newest release goes at the top. The `scripts/release.sh` script reads
the block under `## <version-being-released>` and copies it verbatim
into the `notes` field of `latest.json` — the same text the user sees
in the in-app update dialog.

Keep each section ≤ 6 lines. If you want long-form notes, link out.

---

## 0.1.0

Initial public release. Workspace + Compare + Models install + Storage
+ self-update + in-app feedback.
