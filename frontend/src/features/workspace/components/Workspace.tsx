import { useRef, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { PromptEditor } from "./PromptEditor";
import { OutputStream } from "./OutputStream";
import { RunControls } from "./RunControls";
import { WorkspaceIO } from "./WorkspaceIO";
import { StatusBar } from "./StatusBar";
import { useStreamingRun } from "../hooks/useStreamingRun";
import { formatMetrics } from "../format";
import { AddModelModal } from "../../models/components/AddModelModal";

export function Workspace() {
  const [model, setModel] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { output, status, error, metrics, cancelledInfo, start, cancel } =
    useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-3">
      <div ref={pickerRef}>
        <ModelPicker
          value={model}
          onChange={setModel}
          onAddClick={() => setModalOpen(true)}
        />
      </div>
      <AddModelModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
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
        onRun={() => model && start(model, prompt, systemPrompt)}
        onCancel={cancel}
      />
      <OutputStream output={output} />
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
      <WorkspaceIO
        model={model}
        prompt={prompt}
        onLoad={(m, p) => {
          setModel(m);
          setPrompt(p);
        }}
      />
      <StatusBar
        model={model}
        onModelClick={() =>
          pickerRef.current?.scrollIntoView({ behavior: "smooth" })
        }
      />
    </div>
  );
}
