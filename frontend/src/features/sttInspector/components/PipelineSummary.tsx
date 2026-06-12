import { useSttResultStore } from "../state/sttResultStore";
import { useAssistantResultStore } from "../state/assistantResultStore";

const secs = (ms: number | null | undefined) => (ms == null ? "N/A" : `${(ms / 1000).toFixed(2)}s`);

/// The end-to-end voice-pipeline one-liner: **Audio → Transcript → LLM**, each
/// stage's measured time plus the end-to-end total (STT wall + LLM wall — the
/// processing time, not the audio length). Renders only when the LLM stage ran for
/// the currently shown transcript, so the two stages are never mismatched.
export function PipelineSummary() {
  const t = useSttResultStore((s) => s.result);
  const a = useAssistantResultStore((s) => s.result);
  if (!t || !a || a.transcriptId !== t.id) return null;

  const audioMs = t.audio.duration_secs != null ? t.audio.duration_secs * 1000 : null;
  const sttMs = t.stats.transcribe_wall_ms ?? null;
  const llmMs = a.wallMs;
  const endToEnd = sttMs != null ? sttMs + llmMs : null;

  const Stage = ({ label, value }: { label: string; value: string }) => (
    <span className="whitespace-nowrap">
      <span className="text-gray-500">{label}</span> <span className="font-semibold text-gray-800">{value}</span>
    </span>
  );

  return (
    <div
      className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2"
      data-testid="stt-pipeline-summary"
    >
      <Stage label="Audio" value={secs(audioMs)} />
      <span className="text-gray-300">→</span>
      <Stage label="Transcript" value={secs(sttMs)} />
      <span className="text-gray-300">→</span>
      <Stage label="LLM summarize" value={secs(llmMs)} />
      <span className="text-gray-400">·</span>
      <span className="whitespace-nowrap">
        <span className="text-gray-500">end-to-end</span>{" "}
        <span className="font-bold text-gray-900" data-testid="stt-pipeline-total">{secs(endToEnd)}</span>
      </span>
      {a.auto && (
        <span className="text-[10px] text-green-700 bg-green-50 rounded px-1" title="auto-piped from the transcript (production-faithful)">
          auto
        </span>
      )}
    </div>
  );
}
