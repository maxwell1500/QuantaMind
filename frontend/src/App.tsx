import { useRef, useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";
import { PromptEditor } from "./features/workspace/components/PromptEditor";
import { OutputStream } from "./features/workspace/components/OutputStream";
import { RunControls } from "./features/workspace/components/RunControls";
import { WorkspaceIO } from "./features/workspace/components/WorkspaceIO";
import { StatusBar } from "./features/workspace/components/StatusBar";
import { useStreamingRun } from "./features/workspace/hooks/useStreamingRun";
import { formatMetrics } from "./features/workspace/format";
import { AddModelModal } from "./features/models/components/AddModelModal";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { output, status, error, metrics, cancelledInfo, start, cancel } =
    useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <h1 className="text-2xl font-semibold">Splice</h1>
      <div ref={pickerRef}>
        <ModelPicker
          value={model}
          onChange={setModel}
          onAddClick={() => setModalOpen(true)}
        />
      </div>
      <AddModelModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      <PromptEditor value={prompt} onChange={setPrompt} />
      <RunControls
        status={status}
        canRun={!!model && prompt.trim().length > 0}
        onRun={() => model && start(model, prompt)}
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
    </main>
  );
}
