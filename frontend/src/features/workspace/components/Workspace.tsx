import { PromptEditor } from "./prompt/PromptEditor";
import { ParamsPanel } from "./prompt/ParamsPanel";
import { StatusBar } from "./status/StatusBar";
import { ModelSelectBar } from "./model-select/ModelSelectBar";
import { SingleRun } from "./run/SingleRun";
import { MultiRun } from "./run/MultiRun";
import { HardwareSummary } from "../../compare/components/HardwareSummary";
import { RunStrategyPicker } from "../../compare/components/RunStrategyPicker";
import { PromptTemplatePicker } from "../../../shared/ui/PromptTemplatePicker";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useCompareStore } from "../../compare/state/compareStore";

/// The run surface, scoped to the active backend. One selected model → single
/// streaming run; 2+ (Ollama) → a sequential/parallel compare into columns.
export function Workspace() {
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const selected = useCompareStore((s) => s.selectedModels);
  const model = selected[0]?.name ?? null;
  const multi = selected.length >= 2;

  return (
    <div className="space-y-3">
      <ModelSelectBar />
      {!current ? (
        <p data-testid="workspace-empty" className="text-sm text-gray-500 px-2 py-8 text-center">
          Select a prompt from the Files panel, or click <strong>+ New</strong> to create one.
        </p>
      ) : (
        <>
          <PromptEditor
            value={current.system}
            onChange={(v) => patch({ system: v })}
            label="System prompt (optional)"
            testId="system-prompt-editor"
            height="120px"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">User prompt</span>
            <PromptTemplatePicker onInsert={(body) => patch({ user: body })} />
          </div>
          <PromptEditor
            value={current.user}
            onChange={(v) => patch({ user: v })}
            testId="user-prompt-editor"
          />
          {multi ? (
            <>
              <HardwareSummary />
              <RunStrategyPicker />
              <MultiRun />
            </>
          ) : (
            <>
              <ParamsPanel running={false} />
              <SingleRun model={model} />
            </>
          )}
        </>
      )}
      <StatusBar model={model} onModelClick={() => undefined} />
    </div>
  );
}
