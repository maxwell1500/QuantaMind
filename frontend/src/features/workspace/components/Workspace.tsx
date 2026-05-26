import { useRef, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { PromptEditor } from "./PromptEditor";
import { OutputStream } from "./OutputStream";
import { RunControls } from "./RunControls";
import { StatusBar } from "./StatusBar";
import { useStreamingRun } from "../hooks/useStreamingRun";
import { useWorkspaceStore } from "../state/workspaceStore";
import { formatMetrics } from "../format";

export function Workspace() {
  const model = useWorkspaceStore((s) => s.selectedModel);
  const setModel = useWorkspaceStore((s) => s.setSelectedModel);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const { output, status, error, metrics, cancelledInfo, start, cancel } =
    useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-3">
      <div ref={pickerRef}>
        <ModelPicker value={model} onChange={setModel} />
      </div>
      <PromptEditor
        value={systemPrompt}
        onChange={setSystemPrompt}
        label="System prompt (optional)"
        testId="system-prompt-editor"
        height="120px"
      />
      <PromptEditor
        value={prompt}
        onChange={setPrompt}
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
      <StatusBar
        model={model}
        onModelClick={() =>
          pickerRef.current?.scrollIntoView({ behavior: "smooth" })
        }
      />
    </div>
  );
}
