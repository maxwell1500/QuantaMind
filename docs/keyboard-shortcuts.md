# Keyboard shortcuts

Every primary action has a shortcut. Press **Cmd+/** (Ctrl+/ on
Windows/Linux) to open the cheatsheet. "mod" below means Cmd on macOS,
Ctrl elsewhere.

| Shortcut | Action | Scope |
| --- | --- | --- |
| mod+Enter | Run prompt | Workspace |
| mod+. | Stop run | Workspace |
| mod+S | Save prompt | Workspace |
| mod+N | New prompt | Global |
| mod+O | Open workspace | Global |
| mod+, | Settings | Global |
| mod+Y | Toggle History | Global |
| mod+B | Toggle Files panel | Global |
| mod+/ | Cheatsheet | Global |
| mod+1/2/3 | Switch Models sub-tab | Models tab |

Workspace-scoped shortcuts only fire while the Workspace tab is active
(and Run/Stop respect the current run state). Cmd+, opens the Settings
shell — theme controls land there in Step 2.7.

## How it's wired

- **Single source of truth:** `frontend/src/shared/ui/shortcuts.ts` holds
  the `SHORTCUTS` list. The cheatsheet renders straight from it, so adding
  a binding here also lists it in the modal — verified by a sync test.
- **Matcher:** `frontend/src/shared/ui/useHotkey.ts`. `matchCombo` treats
  Cmd and Ctrl interchangeably as "mod", so the same combos work on every
  platform; `useHotkey(combo, handler, enabled)` registers one keydown
  listener and gates by scope via `enabled`.
- **Handlers live with their state:** workspace shortcuts in
  `useWorkspaceHotkeys` (Workspace), global ones in `appHotkeys`
  (composition root). The legacy raw-listener for Models Cmd+1/2/3 now
  uses `useHotkey` too.

## Verification

- `useHotkey.test.ts` — combo matching (mod/shift/punctuation),
  fire-on-match, disabled-no-fire.
- `CheatsheetModal.test.tsx` — every registered shortcut renders; Escape
  and backdrop close.
- Live check (pending GUI): press each shortcut and confirm its action;
  open the cheatsheet with Cmd+/.
