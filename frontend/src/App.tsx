import { useState } from "react";
import { ModelPicker } from "./features/workspace/components/ModelPicker";

export default function App() {
  const [model, setModel] = useState<string | null>(null);
  return (
    <main className="min-h-screen p-6 font-sans">
      <h1 className="text-2xl font-semibold mb-4">Splice</h1>
      <ModelPicker value={model} onChange={setModel} />
      {model && (
        <p className="text-sm text-gray-600 mt-3">Selected: {model}</p>
      )}
    </main>
  );
}
