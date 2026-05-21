import { useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";
import { PromptEditor } from "./features/workspace/components/PromptEditor";
import { OutputStream } from "./features/workspace/components/OutputStream";
import { useStreamingRun } from "./features/workspace/hooks/useStreamingRun";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const { output } = useStreamingRun();
  return (
    <main className="min-h-screen p-6 font-sans space-y-3">
      <h1 className="text-2xl font-semibold">Splice</h1>
      <ModelPicker value={model} onChange={setModel} />
      <PromptEditor value={prompt} onChange={setPrompt} />
      <OutputStream output={output} />
      {model && <p className="text-sm text-gray-600">Selected: {model}</p>}
    </main>
  );
}
