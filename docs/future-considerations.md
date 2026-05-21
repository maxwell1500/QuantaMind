# Future Considerations

A parking lot for ideas that look better than a locked decision. They do
NOT enter the codebase. They stay here until the *current* phase ships.

Tool churn is procrastination wearing a productive disguise. Resist.

## Format

For each entry:

```
### <topic> — <date proposed>
Current choice: <what we have>
Proposed alternative: <what it would be>
Claimed benefit: <why someone thought it was better>
Why we said no (now): <the reason it is parked>
Revisit when: <a concrete trigger, not "later">
```

## Entries

### serde_yaml → serde_yml — 2026-05-21
Current choice: `serde_yaml = "0.9"` for prompt persistence (step 1.12).
Proposed alternative: `serde_yml` (dtolnay-blessed community fork) or `yaml-rust2`.
Claimed benefit: `serde_yaml` is crate-deprecated by its author; alternatives are actively maintained.
Why we said no (now): `serde_yaml 0.9` still compiles, still receives security advisories, and the round-trip behavior we depend on is stable. Migrating mid-Phase 1 buys nothing.
Revisit when: serde_yaml fails to build against the current Rust toolchain, or a security CVE lands with no upstream fix.

## Rules

- Never edit the locked stack in `tech-stack.md` to match an entry here
  without an explicit user decision in chat.
- A "revisit when" must be a concrete signal: "if benchmark X regresses
  by Y%", "if we hit N contributors", "when shipping vN.0". Not "later".
- If an entry has been parked > 6 months and nothing has triggered it,
  delete it. Stale ideas are noise.
