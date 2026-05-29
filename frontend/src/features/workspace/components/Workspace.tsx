import { PromptEditor } from "./prompt/PromptEditor";
import { ParamsPanel } from "./prompt/ParamsPanel";
import { StatusBar } from "./status/StatusBar";
import { ModelSelectBar } from "./model-select/ModelSelectBar";
import { SingleRun } from "./run/SingleRun";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";

/// Single-model run surface, scoped to the active backend. Multi-model
/// comparison lives in the Bench tab (see CompareTab).
export function Workspace() {
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const model = useWorkspaceStore((s) => s.selectedModel);

  return (
    <div className="space-y-3">
      <ModelSelectBar />
      {!current ? (
        <p data-testid="workspace-empty" className="text-sm text-gray-500 px-2 py-8 text-center">
          Select a prompt from the Files panel, or click <strong>+ New</strong> to create one.
        </p>
      ) : (
        <>
          <ParamsPanel running={false} />
          <PromptEditor
            value={current.system}
            onChange={(v) => patch({ system: v })}
            label="System prompt (optional)"
            testId="system-prompt-editor"
            height="120px"
          />
          <PromptEditor
            value={current.user}
            onChange={(v) => patch({ user: v })}
            label="User prompt"
            testId="user-prompt-editor"
          />
          <SingleRun model={model} />
        </>
      )}
      <StatusBar model={model} onModelClick={() => undefined} />
    </div>
  );
}
