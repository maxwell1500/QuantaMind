import { PromptEditor } from "./prompt/PromptEditor";
import { ParamsPanel } from "./prompt/ParamsPanel";
import { StatusBar } from "./status/StatusBar";
import { ModelSelectBar } from "./model-select/ModelSelectBar";
import { SingleRun } from "./run/SingleRun";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useCompareStore } from "../../compare/state/compareStore";

/// Single-model run surface, scoped to the active backend. The primary
/// selection is the first of compareStore.selectedModels (Ollama may select
/// more, which the multi-model branch handles — see Step 2).
export function Workspace() {
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const model = useCompareStore((s) => s.selectedModels[0]?.name ?? null);

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
