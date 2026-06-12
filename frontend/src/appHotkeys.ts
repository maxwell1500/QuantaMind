import { useHotkey } from "./shared/ui/useHotkey";
import { comboFor } from "./shared/ui/shortcuts";
import { useUiStore } from "./shared/state/uiStore";
import { useNavStore } from "./shared/state/navStore";
import { useHistoryStore } from "./features/history/state/historyStore";
import { useOpenWorkspace } from "./features/workspaces/hooks/useOpenWorkspace";

/// App-level (composition root) wiring of the global shortcuts to their
/// store actions. Workspace-only toggles are gated to the workspace view.
export function useGlobalHotkeys() {
  const ws = useNavStore((s) => s.topView) === "workspace";
  const toggleCheatsheet = useUiStore((s) => s.toggleCheatsheet);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const toggleHistory = useHistoryStore((s) => s.toggle);
  const requestNewPrompt = useUiStore((s) => s.setCreatingPrompt);
  const { browse } = useOpenWorkspace();

  useHotkey(comboFor("new"), () => requestNewPrompt(true), ws);
  useHotkey(comboFor("open"), () => void browse(), true);
  useHotkey(comboFor("history"), toggleHistory, ws);
  useHotkey(comboFor("files"), toggleSidebar, ws);
  useHotkey(comboFor("cheatsheet"), toggleCheatsheet, true);
}
