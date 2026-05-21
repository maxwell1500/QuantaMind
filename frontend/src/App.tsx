import { useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";
import { PromptEditor } from "./features/workspace/components/PromptEditor";
import { OutputStream } from "./features/workspace/components/OutputStream";
import { RunControls } from "./features/workspace/components/RunControls";
import { useStreamingRun } from "./features/workspace/hooks/useStreamingRun";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const { output, status, error, start, cancel } = useStreamingRun();
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
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </main>
  );
}
