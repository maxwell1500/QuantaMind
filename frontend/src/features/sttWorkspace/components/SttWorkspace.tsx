import { useCallback, useEffect } from "react";
import type { RunningSttEngine } from "../../stt/state/sttRuntimeStore";
import { useTranscription } from "../hooks/useTranscription";
import { useTranscriptStore } from "../state/transcriptStore";
import { TranscriptPane } from "./TranscriptPane";
import { ReferencePane } from "./ReferencePane";
import { RecordControls } from "./RecordControls";
import { VoiceAssistant } from "./VoiceAssistant";
import { SttProfilePanel } from "./SttProfilePanel";

/// mlx-audio transcription is code-complete but gated: mlx-audio 0.4.4 + mlx 0.31.2
/// crash their server during STT inference ("There is no Stream(gpu, 1) in current
/// thread") — its inference broker runs the model on a worker thread without a Metal
/// GPU stream. Flip to `false` once a fixed mlx-audio is in (the transcribe path +
/// the asr-fp16 catalog are already wired for it).
const MLX_TRANSCRIBE_BLOCKED = true;

/// The Workspace's STT mode (shown while an STT server is running). Two panes —
/// the live canonical transcript + an optional reference — fed by Record/Upload.
/// whisper.cpp uses its running model; mlx-audio would use the selected repo
/// (`model`), but is gated until the upstream crash above is fixed.
export function SttWorkspace({ engine, model }: { engine: RunningSttEngine; model?: string | null }) {
  const { run } = useTranscription();
  const reset = useTranscriptStore((s) => s.reset);

  // Transient: clear the live transcript on leave (disk is the source of truth).
  useEffect(() => () => reset(), [reset]);

  // The mlx-audio model rides with each run; whisper.cpp ignores it.
  const onRun = useCallback((path: string) => run(path, engine === "mlx_audio" ? model : null), [run, engine, model]);

  if (engine === "mlx_audio" && MLX_TRANSCRIBE_BLOCKED) {
    return (
      <div className="border rounded p-4 text-sm text-amber-800 bg-amber-50" data-testid="stt-mlx-blocked">
        <div className="font-medium mb-1">mlx-audio transcription is temporarily unavailable</div>
        <p>
          A known bug in the current mlx-audio library crashes its server during transcription (an MLX
          GPU-threading issue, not your audio). We're tracking the upstream fix.
        </p>
        <p className="mt-1">
          Switch the STT engine to <strong>whisper.cpp</strong> in the header for stable transcription.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stt-workspace">
      <VoiceAssistant />
      <RecordControls onRun={onRun} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TranscriptPane />
        <ReferencePane />
      </div>
      <SttProfilePanel />
    </div>
  );
}
