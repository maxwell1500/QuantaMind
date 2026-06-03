import { useWorkspaceStore } from "../../state/workspaceStore";
import { OllamaControl } from "./OllamaControl";
import { LlamaServerControl } from "./LlamaServerControl";
import { MlxServerControl } from "./MlxServerControl";

/// The single header Start/Stop control. Reflects the active backend chosen in
/// the BackendPanel and starts/stops that server (not the prompt run).
export function ServerControl() {
  const activeBackend = useWorkspaceStore((s) => s.activeBackend);
  if (activeBackend === "ollama") return <OllamaControl />;
  if (activeBackend === "mlx") return <MlxServerControl />;
  return <LlamaServerControl />;
}
