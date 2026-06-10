import { useTranscriptStore } from "../state/transcriptStore";

/// Optional reference script. Empty stays `null` in the store (first-class — it
/// drives reference-optional scoring in P4), never coerced to "".
export function ReferencePane() {
  const reference = useTranscriptStore((s) => s.reference);
  const setReference = useTranscriptStore((s) => s.setReference);

  return (
    <div className="flex flex-col gap-2 border rounded p-3 min-h-[300px]" data-testid="stt-reference-pane">
      <div className="text-xs text-gray-500">Reference script (optional)</div>
      <textarea
        data-testid="stt-reference-input"
        value={reference ?? ""}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Paste a reference transcript to compare against (optional)."
        className="flex-1 text-sm resize-none outline-none bg-transparent"
      />
    </div>
  );
}
