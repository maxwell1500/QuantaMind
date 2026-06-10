import { useState } from "react";
import { useTranscriptStore } from "../state/transcriptStore";
import { useAssistantRun } from "../hooks/useAssistantRun";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

/// Voice → assistant: the transcript becomes the user's message; an optional
/// typed prompt is the system/context (e.g. "You are a customer support agent").
/// Sends both to the selected LLM and streams its reasoned reply. The prompt is
/// optional — without it the model just answers the transcript.
export function VoiceAssistant() {
  const segments = useTranscriptStore((s) => s.segments);
  const sttStatus = useTranscriptStore((s) => s.status);
  const model = useSelectedModelStore((s) => s.selectedModels[0]?.name ?? null);
  const { output, status, error, run, stop } = useAssistantRun();
  const [prompt, setPrompt] = useState("");

  const transcript = segments.map((s) => s.text.trim()).filter(Boolean).join(" ");
  const ready = sttStatus === "done" && transcript.length > 0;
  const canAsk = ready && !!model && status !== "running";

  const onAsk = () => {
    if (model) void run(model, transcript, prompt);
  };

  return (
    <div className="flex flex-col gap-2 border rounded p-3" data-testid="stt-assistant">
      <div className="text-xs text-gray-500">Assistant prompt (optional)</div>
      <textarea
        data-testid="stt-assistant-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={'e.g. "You are a customer support agent for Amazon ecommerce."'}
        className="text-sm resize-none outline-none bg-transparent border rounded p-2 min-h-[60px]"
      />
      <div className="flex items-center gap-3">
        {status === "running" ? (
          <button
            type="button"
            onClick={() => void stop()}
            data-testid="stt-assistant-stop"
            className="text-sm border rounded px-3 py-1 bg-red-50 text-red-700"
          >
            ⏹ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onAsk}
            disabled={!canAsk}
            data-testid="stt-assistant-ask"
            className="text-sm border rounded px-3 py-1 disabled:opacity-50"
          >
            Ask the assistant
          </button>
        )}
        {!ready && <span className="text-xs text-gray-400">Record or upload audio first.</span>}
        {ready && !model && (
          <span className="text-xs text-amber-700" data-testid="stt-assistant-no-model">
            Pick a model in the header to answer.
          </span>
        )}
      </div>
      {error && (
        <div role="alert" className="text-xs text-red-600" data-testid="stt-assistant-error">
          {error}
        </div>
      )}
      {output && (
        <div className="text-sm whitespace-pre-wrap border-t pt-2" data-testid="stt-assistant-output">
          {output}
        </div>
      )}
    </div>
  );
}
