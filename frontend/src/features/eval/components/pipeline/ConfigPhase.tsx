import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import { panelBox, panelLabel, codeBlock } from "./pipelineStyles";

/// Phase 1 — Input Config: the raw user prompt + the tool definitions the model
/// is allowed to use (exactly what the task carries).
export function ConfigPhase({ task }: { task: ToolTask }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="pipeline-config">
      <div style={panelBox}>
        <div style={panelLabel}>User Prompt</div>
        <div style={{ fontSize: 13, color: "#cbd5e1", fontFamily: "Inter,sans-serif" }}>{task.prompt}</div>
      </div>
      <div style={panelBox}>
        <div style={panelLabel}>Tool Definition (JSON Schema)</div>
        <pre style={codeBlock}>{JSON.stringify(task.tools, null, 2)}</pre>
      </div>
    </div>
  );
}
