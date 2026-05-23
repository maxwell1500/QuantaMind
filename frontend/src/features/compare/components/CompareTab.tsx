import { useCompareStore } from "../state/compareStore";

export function CompareTab() {
  const selectedModels = useCompareStore((s) => s.selectedModels);
  const prompt = useCompareStore((s) => s.prompt);
  const setPrompt = useCompareStore((s) => s.setPrompt);

  return (
    <section data-testid="tab-compare" className="space-y-3">
      <h2 className="text-lg font-semibold">Compare</h2>
      <p className="text-xs text-gray-600">
        Pick multiple models, write one prompt, run them side-by-side.
      </p>
      <p className="text-xs text-gray-500" data-testid="compare-selected-summary">
        Selected:{" "}
        {selectedModels.length === 0
          ? "none yet"
          : selectedModels.map((m) => m.name).join(", ")}
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Type the prompt to run against all selected models…"
        className="w-full border rounded p-2 text-sm font-mono"
        rows={4}
        data-testid="compare-prompt"
      />
    </section>
  );
}
