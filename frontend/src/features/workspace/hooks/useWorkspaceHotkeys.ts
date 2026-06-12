import { useHotkey } from "../../../shared/ui/useHotkey";
import { comboFor } from "../../../shared/ui/shortcuts";

type Opts = {
  active: boolean;
  canRun: boolean;
  running: boolean;
  hasPrompt: boolean;
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
};

/// Workspace-scoped shortcuts: Run (Cmd+Enter), Stop (Cmd+.), Save (Cmd+S).
/// `active` gates them to the workspace view so they don't fire elsewhere.
export function useWorkspaceHotkeys({ active, canRun, running, hasPrompt, onRun, onStop, onSave }: Opts) {
  useHotkey(comboFor("run"), onRun, active && canRun && !running);
  useHotkey(comboFor("stop"), onStop, active && running);
  useHotkey(comboFor("save"), onSave, active && hasPrompt);
}
