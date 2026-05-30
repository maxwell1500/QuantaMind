export type ShortcutScope = "Global" | "Workspace";

export interface Shortcut {
  id: string;
  combo: string;
  label: string;
  scope: ShortcutScope;
}

/// Single source of truth for keyboard shortcuts. The cheatsheet renders
/// this list; each binding's handler is wired where its state lives via
/// `useHotkey(combo, ...)`. Add a shortcut here and it shows in the modal.
export const SHORTCUTS: Shortcut[] = [
  { id: "run", combo: "mod+enter", label: "Run prompt", scope: "Workspace" },
  { id: "stop", combo: "mod+.", label: "Stop run", scope: "Workspace" },
  { id: "save", combo: "mod+s", label: "Save prompt", scope: "Workspace" },
  { id: "new", combo: "mod+n", label: "New prompt", scope: "Global" },
  { id: "open", combo: "mod+o", label: "Open workspace", scope: "Global" },
  { id: "history", combo: "mod+y", label: "Toggle History", scope: "Global" },
  { id: "files", combo: "mod+b", label: "Toggle Files", scope: "Global" },
  { id: "cheatsheet", combo: "mod+/", label: "Keyboard shortcuts", scope: "Global" },
];

const isMac =
  typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);

const SYMBOLS: Record<string, string> = {
  mod: isMac ? "⌘" : "Ctrl",
  shift: "⇧",
  enter: "↵",
};

/// Human display for a combo, e.g. "mod+enter" -> "⌘↵" (mac) / "Ctrl+↵".
export function displayKeys(combo: string): string {
  return combo
    .split("+")
    .map((p) => SYMBOLS[p] ?? p.toUpperCase())
    .join(isMac ? "" : "+");
}

export function comboFor(id: string): string {
  return SHORTCUTS.find((s) => s.id === id)?.combo ?? "";
}
