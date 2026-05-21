import { useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";
import { PromptEditor } from "./features/workspace/components/PromptEditor";
import { OutputStream } from "./features/workspace/components/OutputStream";
import { RunControls } from "./features/workspace/components/RunControls";
import { WorkspaceIO } from "./features/workspace/components/WorkspaceIO";
import { useStreamingRun } from "./features/workspace/hooks/useStreamingRun";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const { output, status, error, metrics, start, cancel } = useStreamingRun();
  return (
    <main className="min-h-screen p-6 font-sans space-y-3">
      <h1 className="text-2xl font-semibold">Splice</h1>
      <ModelPicker value={model} onChange={setModel} />
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
          TTFT: {metrics.ttft_ms ?? "—"} ms ·{" "}
          {metrics.tokens_per_sec?.toFixed(1) ?? "—"} tok/s ·{" "}
          {metrics.token_count} tokens
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
    </main>
  );
}
