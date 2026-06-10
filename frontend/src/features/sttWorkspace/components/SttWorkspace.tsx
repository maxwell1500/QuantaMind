import { useEffect } from "react";
import type { RunningSttEngine } from "../../stt/state/sttRuntimeStore";
import { useTranscription } from "../hooks/useTranscription";
import { useTranscriptStore } from "../state/transcriptStore";
import { TranscriptPane } from "./TranscriptPane";
import { ReferencePane } from "./ReferencePane";
import { RecordControls } from "./RecordControls";
import { VoiceAssistant } from "./VoiceAssistant";
import { SttProfilePanel } from "./SttProfilePanel";

/// The Workspace's STT mode (shown while an STT server is running). Two panes —
/// the live canonical transcript + an optional reference — fed by Record/Upload.
/// Transcription runs on whisper.cpp; mlx-audio shows a proactive notice.
export function SttWorkspace({ engine }: { engine: RunningSttEngine }) {
  const { run } = useTranscription();
  const reset = useTranscriptStore((s) => s.reset);

  // Transient: clear the live transcript on leave (disk is the source of truth).
  useEffect(() => () => reset(), [reset]);

  if (engine === "mlx_audio") {
    return (
      <div className="border rounded p-4 text-sm text-amber-800 bg-amber-50" data-testid="stt-mlx-notice">
        Transcription runs on whisper.cpp for now. Switch the STT engine to whisper.cpp to transcribe —
        mlx-audio transcription is coming in a later phase.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="stt-workspace">
      <VoiceAssistant />
      <RecordControls onRun={run} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TranscriptPane />
        <ReferencePane />
      </div>
      <SttProfilePanel />
    </div>
  );
}
