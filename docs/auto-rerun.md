# Auto-rerun on save

The marquee v0.2 feature — "Vite for AI." Toggle **Auto-rerun on save**
in RunControls and the workspace re-runs the current prompt 800ms after
you stop typing. The toggle is per-prompt, persisted as `auto_rerun:` in
the prompt's YAML.

## The 800ms choice

800ms matches the "feels instant but not twitchy" window HMR tools use:
long enough that a normal typing cadence (<800ms between keystrokes)
collapses into one run, short enough that a deliberate pause triggers
feedback before you reach for the mouse. Tuned in
`useAutoRerun.AUTO_RERUN_MS`.

## State machine

`useAutoRerun` (`features/workspace/hooks/useAutoRerun.ts`) tracks:

- **selectionId** (`currentPath`): opening a *different* prompt resets the
  baseline and never fires — selection is not an edit.
- **runKey** (`JSON.stringify([user, system, params])`): a change here is
  an edit. Starts the 800ms debounce; `pending` flips true (drives the
  Run-button pulse) and clears when the run fires.
- **status**: while a run is in progress, edits are *not* scheduled — they
  set a `dirtyDuringRun` flag. When the run leaves `running`, exactly one
  re-run is queued if an edit happened mid-run. This never drops the
  user's last keystroke and never stacks runs.

## Visual feedback

During the debounce window the Run button gets `animate-pulse` +
`ring-2 ring-blue-300` (see `RunControls` `pulsing` prop). The pulse
clears the instant the run fires or the toggle is switched off.

## Guarantees (all covered by tests)

`features/workspace/hooks/__tests__/useAutoRerun.test.ts`:

- Fires exactly once 800ms after an edit, not before.
- Rapid edits debounce into a single fire.
- Never fires on prompt selection.
- Never fires while a run is in progress.
- Re-fires exactly once after completion if edited mid-run.
- Toggling off cancels a pending fire.
- `pending` is true only during the debounce window.

## Verification (pending GUI)

In a live window: open a prompt, toggle on, type a few keys with <800ms
gaps → one run. Type during a run → exactly one follow-up run. Confirm
the pulse fades cleanly when the run starts.
