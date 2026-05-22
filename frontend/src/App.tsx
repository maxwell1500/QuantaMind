import { useRef, useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";
import { PromptEditor } from "./features/workspace/components/PromptEditor";
import { OutputStream } from "./features/workspace/components/OutputStream";
import { RunControls } from "./features/workspace/components/RunControls";
import { WorkspaceIO } from "./features/workspace/components/WorkspaceIO";
import { StatusBar } from "./features/workspace/components/StatusBar";
import { useStreamingRun } from "./features/workspace/hooks/useStreamingRun";
import { formatMetrics } from "./features/workspace/format";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const { output, status, error, metrics, start, cancel } = useStreamingRun();
  const pickerRef = useRef<HTMLDivElement>(null);
  return (
    <main className="min-h-screen p-6 pb-14 font-sans space-y-3">
      <h1 className="text-2xl font-semibold">Splice</h1>
      <div ref={pickerRef}>
        <ModelPicker value={model} onChange={setModel} />
      </div>
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
