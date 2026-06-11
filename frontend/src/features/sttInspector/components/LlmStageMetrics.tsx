import { useAssistantResultStore } from "../state/assistantResultStore";

/// The TTT (LLM) stage breakdown — shown **below** the Whisper.cpp STT metrics so
/// the user sees both stages of the voice pipeline. Real measured values; a null
/// renders "N/A", never a fabricated number. `showOutput` includes the summary
/// text (Analysis tab); the Inspector shows metrics only.
export function LlmStageMetrics({ showOutput = false }: { showOutput?: boolean }) {
  const a = useAssistantResultStore((s) => s.result);
  if (!a) return null;

  const cells: { label: string; value: string }[] = [
    { label: "TTFT", value: a.ttftMs == null ? "N/A" : `${Math.round(a.ttftMs)} ms` },
    { label: "Throughput", value: a.tokensPerSec == null ? "N/A" : `${a.tokensPerSec.toFixed(1)} tok/s` },
    { label: "Tokens", value: `${a.tokenCount}` },
    {
      label: "LLM total",
      value: a.totalMs == null ? `${a.wallMs.toFixed(0)} ms (wall)` : `${Math.round(a.totalMs)} ms`,
    },
  ];

  return (
    <section className="space-y-2" data-testid="stt-llm-stage">
      <div className="text-sm font-semibold text-gray-800">
        LLM summary · <span className="font-mono text-gray-500">{a.model}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="border rounded p-2 bg-gray-50" data-testid={`stt-llm-${c.label.toLowerCase().split(" ")[0]}`}>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{c.label}</div>
            <div className="text-sm font-semibold text-gray-800">{c.value}</div>
          </div>
        ))}
      </div>
      {showOutput && (
        <div
          className="text-sm text-gray-700 whitespace-pre-wrap border rounded p-3 bg-white max-h-48 overflow-auto"
          data-testid="stt-llm-output"
        >
          {a.output || <span className="text-gray-400 italic">No summary produced</span>}
        </div>
      )}
    </section>
  );
}
