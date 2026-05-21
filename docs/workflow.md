# Workflow — One Step at a Time

This is the single most important doc in the repo. Follow it literally.

## The loop

For every unit of work (one step, one ticket, one feature slice):

```
[1] Understand the step
    └─ Read the spec from docs/phase-roadmap.md or the user message.
    └─ Write down the expected input and expected output in your head
       (or in the test file) BEFORE writing any code.

[2] Implement the minimum
    └─ Smallest code change that could satisfy the spec.
    └─ No speculative abstractions. No "while I'm here" cleanup.

[3] Write the test
    └─ One test per behavior. Name it after the behavior, not the function.
    └─ Tests live next to code: src/.../__tests__/ or src-tauri/tests/.

[4] Run the test
    └─ It must pass. If it does not, fix the code (not the assertion).

[5] Verify the output (DATA QUALITY GATE)
    └─ A green test is NECESSARY but NOT SUFFICIENT.
    └─ Print/log the actual output. Eyeball it.
    └─ Does it match expected shape? Expected types? Expected values?
    └─ Are edge cases (empty, large, unicode, malformed) handled?
    └─ See docs/data-quality.md for the full checklist.

[6] Update docs
    └─ If behavior changed, update the doc that describes it.
    └─ If no doc covers it, create one in docs/.

[7] Commit
    └─ Conventional Commits: feat:, fix:, chore:, docs:, test:, refactor:.
    └─ One step = one commit (or a tight series of related commits).

[8] Move on
    └─ Only now is the next step allowed to begin.
```

## Common violations (do not do these)

- **Stacking steps.** "Let me knock out steps 1–3 then test." → No. Test
  after each one.
- **Loosening assertions to make tests pass.** If `assert eq 42` fails
  because the output is 41, do not change to `assert > 40`. Fix the code.
- **Skipping verification because the test passed.** Tests verify the path
  you wrote. Verification confirms the path was the right one.
- **Bundling docs into "I'll update them later."** Later does not exist.
  Doc updates ship with the code.
- **Refactoring during a feature.** Open a separate branch/commit.

## Stop conditions

Stop and ask the user if:
- A step's spec is ambiguous and you would have to guess at intent.
- The data-quality gate fails and the fix would change the spec.
- A file is about to exceed 100 lines and the split is non-obvious.
- A test requires real hardware (GPU, large model) that may not be present.
