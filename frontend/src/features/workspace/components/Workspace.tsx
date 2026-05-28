import { useRef } from "react";
import { ModelPicker } from "./ModelPicker";
import { PromptEditor } from "./PromptEditor";
import { OutputStream } from "./OutputStream";
import { RunControls } from "./RunControls";
import { StatusBar } from "./StatusBar";
import { useStreamingRun } from "../hooks/useStreamingRun";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { formatMetrics } from "../format";

export function Workspace() {
  const model = useWorkspaceStore((s) => s.selectedModel);
  const setModel = useWorkspaceStore((s) => s.setSelectedModel);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const current = useWorkspacesStore((s) => s.current);
  const patch = useWorkspacesStore((s) => s.patch);
  const { output, status, error, metrics, cancelledInfo, start, cancel } =
    useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  const prompt = current?.user ?? "";
  const systemPrompt = current?.system ?? "";
  return (
    <div className="space-y-3">
      <div ref={pickerRef}>
        <ModelPicker value={model} onChange={setModel} />
      </div>
      {!current ? (
        <p
          data-testid="workspace-empty"
          className="text-sm text-gray-500 px-2 py-8 text-center"
        >
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
          <RunControls
            status={status}
            canRun={!!model && prompt.trim().length > 0}
            ollamaHealthy={ollamaHealthy}
            onRun={() => model && start(model, prompt, systemPrompt)}
            onCancel={cancel}
          />
          <OutputStream output={output} loading={status === "running" && !output} />
          {metrics && (
            <p className="text-xs text-gray-600" data-testid="metrics">
              {formatMetrics(metrics)}
            </p>
          )}
          {cancelledInfo && (
            <p className="text-xs text-amber-700" data-testid="cancelled-info">
              Cancelled · {cancelledInfo.token_count} tokens
            </p>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </>
      )}
      <StatusBar
        model={model}
        onModelClick={() =>
          pickerRef.current?.scrollIntoView({ behavior: "smooth" })
        }
      />
    </div>
  );
}
