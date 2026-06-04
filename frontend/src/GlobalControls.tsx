import { BackendSelector } from "./BackendSelector";
import { ModelSelector } from "./ModelSelector";
import { ParamsControl } from "./ParamsControl";
import { ServerControl } from "./features/workspace/components/status/ServerControl";

/// The global header controls, shown on every view: the backend picker, the
/// global model picker (which also holds the keep-loaded toggle), the
/// inference-parameters popover, and the matching server Start/Stop. Composed at
/// the shell level (features don't import each other) — see WorkspaceSidebar.
export function GlobalControls() {
  return (
    <div className="flex items-center gap-2" data-testid="global-controls">
      <BackendSelector />
      <ModelSelector />
      <ParamsControl />
      <ServerControl />
    </div>
  );
}
