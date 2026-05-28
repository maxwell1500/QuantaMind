import { useEffect } from "react";
import { PromptEditor } from "./PromptEditor";
import { ParamsPanel } from "./ParamsPanel";
import { StatusBar } from "./StatusBar";
import { ModelSelectBar } from "./ModelSelectBar";
import { SingleRun } from "./SingleRun";
import { MultiRun } from "./MultiRun";
import { HardwareSummary } from "../../compare/components/HardwareSummary";
import { useCompareStore } from "../../compare/state/compareStore";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";

export function Workspace() {
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const selectedModels = useCompareStore((s) => s.selectedModels);
  const count = selectedModels.length;
  const primaryModel = selectedModels[0]?.name ?? null;

  // Mirror the primary model for the StatusBar + feedback diagnostics.
  useEffect(() => {
    useWorkspaceStore.getState().setSelectedModel(primaryModel);
  }, [primaryModel]);

  return (
    <div className="space-y-3">
      <ModelSelectBar />
      <HardwareSummary />
      {!current ? (
        <p data-testid="workspace-empty" className="text-sm text-gray-500 px-2 py-8 text-center">
          Select a prompt from the Files panel, or click <strong>+ New</strong> to create one.
        </p>
      ) : (
        <>
          {count < 2 && <ParamsPanel running={false} />}
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
          {count >= 2 ? <MultiRun /> : <SingleRun model={primaryModel} />}
        </>
      )}
      <StatusBar model={primaryModel} onModelClick={() => undefined} />
    </div>
  );
}
