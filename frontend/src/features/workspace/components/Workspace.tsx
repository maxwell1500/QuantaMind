import { useRef } from "react";
import { ModelPicker } from "./ModelPicker";
import { PromptEditor } from "./PromptEditor";
import { RunControls } from "./RunControls";
import { ParamsPanel } from "./ParamsPanel";
import { StatusBar } from "./StatusBar";
import { RunOutput } from "./RunOutput";
import { useStreamingRun } from "../hooks/useStreamingRun";
import { useAutoRerun } from "../hooks/useAutoRerun";
import { useWorkspaceHotkeys } from "../hooks/useWorkspaceHotkeys";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";

export function Workspace() {
  const model = useWorkspaceStore((s) => s.selectedModel);
  const setModel = useWorkspaceStore((s) => s.setSelectedModel);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const current = useWorkspacesStore((s) => s.current);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const patch = useWorkspacesStore((s) => s.patch);
  const save = useWorkspacesStore((s) => s.save);
  const workspaceActive = useNavStore((s) => s.topView) === "workspace";
  const { output, status, error, metrics, cancelledInfo, start, cancel } =
    useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  const prompt = current?.user ?? "";
  const systemPrompt = current?.system ?? "";
  const canRun = !!model && prompt.trim().length > 0;
  const runNow = () => model && start(model, prompt, systemPrompt, current?.params, currentPath);
  const { pending: pulsing } = useAutoRerun({
    enabled: !!current?.auto_rerun,
    selectionId: currentPath,
    runKey: JSON.stringify([prompt, systemPrompt, current?.params]),
    status,
    canRun: canRun && model !== null,
    onFire: runNow,
  });
  useWorkspaceHotkeys({
    active: workspaceActive,
    canRun,
    running: status === "running",
    hasPrompt: !!current,
    onRun: runNow,
    onStop: cancel,
    onSave: () => void save(),
  });
  return (
    <div className="space-y-3">
      <div ref={pickerRef}>
        <ModelPicker value={model} onChange={setModel} />
      </div>
      {!current ? (
        <p data-testid="workspace-empty" className="text-sm text-gray-500 px-2 py-8 text-center">
          Select a prompt from the Files panel, or click <strong>+ New</strong> to create one.
        </p>
      ) : (
        <>
          <PromptEditor
            value={systemPrompt}
            onChange={(v) => patch({ system: v })}
            label="System prompt (optional)"
            testId="system-prompt-editor"
            height="120px"
          />
          <PromptEditor
            value={prompt}
            onChange={(v) => patch({ user: v })}
            label="User prompt"
            testId="user-prompt-editor"
          />
          <ParamsPanel running={status === "running"} />
          <RunControls
            status={status}
            canRun={canRun}
            ollamaHealthy={ollamaHealthy}
            onRun={() => model && start(model, prompt, systemPrompt, current.params, currentPath)}
            onCancel={cancel}
            autoRerun={!!current.auto_rerun}
            onToggleAutoRerun={() => patch({ auto_rerun: !current.auto_rerun })}
            pulsing={pulsing}
          />
          <RunOutput
            output={output}
            status={status}
            metrics={metrics}
            cancelledInfo={cancelledInfo}
            error={error}
            onRetry={runNow}
          />
        </>
      )}
      <StatusBar
        model={model}
        onModelClick={() => pickerRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
    </div>
  );
}
