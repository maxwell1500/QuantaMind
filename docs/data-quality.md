# Data Quality — Beyond "Test Passed"

A passing test only means the code executed the path you described. Data
quality means the *output* is actually correct. Both gates must pass before
a step is considered done.

## Why this matters

Tests lie when:
- Mocks return canned values that match the assertion but not reality.
- Assertions check `result != null` but not the contents.
- The function returns the right type with the wrong values.
- Streaming code emits tokens but in the wrong order, encoding, or count.
- Persistence "succeeds" but writes corrupted YAML.

## The verification checklist

After every green test, run through this:

1. **Shape**
   - Is the type what you expected (string vs object vs array)?
   - Are required fields present? Are no surprise fields added?
   - For streams: count of chunks, ordering, terminator behavior.

2. **Values**
   - Sample the actual values. Are they within reasonable ranges?
   - Numeric: units correct? (ms vs s, bytes vs MB)
   - Strings: encoding correct? (UTF-8, no BOM, no escape leaks)
   - Timestamps: timezone correct? Monotonic where required?

3. **Edge cases**
   - Empty input → empty output (not crash, not null).
   - Very large input → handled or rejected with a clear error.
   - Unicode / emoji / RTL → preserved through the pipeline.
   - Malformed input → fails with a typed error, not a panic.

4. **Cross-boundary fidelity**
   - Rust → JSON → TS: does the field round-trip? (snake_case vs camelCase!)
   - Disk → memory: does YAML reload byte-identical to what was saved?
   - Network → app: are partial reads / disconnections handled?

5. **Determinism (where applicable)**
   - Same input → same output? If not, is the non-determinism documented?

## How to verify

- Print the output. Read it. Do not skim.
- For streams, dump the first N and last N chunks to a file and inspect.
- For persistence, `diff` the round-tripped artifact against the original.
- For IPC, log both sides of the boundary and compare.

## When verification fails

- Do NOT relax the test. The test was right.
- Fix the producing code. Add a regression test for the specific failure.
- If the spec was wrong, update the spec AND the test together.

## What you log

- During development: verbose `println!` / `console.log` is fine.
- Before commit: remove or gate behind a debug flag.
- Never commit logs that contain prompt content or user data.
