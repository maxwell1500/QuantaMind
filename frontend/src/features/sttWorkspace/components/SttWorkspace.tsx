import { useEffect } from "react";
import { useTranscription } from "../hooks/useTranscription";
import { useTranscriptStore } from "../state/transcriptStore";
import { TranscriptPane } from "./TranscriptPane";
import { ReferencePane } from "./ReferencePane";
import { RecordControls } from "./RecordControls";
import { VoiceAssistant } from "./VoiceAssistant";
import { SttProfilePanel } from "./SttProfilePanel";

/// The Workspace's STT mode (shown while the whisper.cpp STT server is running).
/// Two panes — the live canonical transcript + an optional reference — fed by
/// Record/Upload.
export function SttWorkspace() {
  const { run } = useTranscription();
  const reset = useTranscriptStore((s) => s.reset);

  // Transient: clear the live transcript on leave (disk is the source of truth).
  useEffect(() => () => reset(), [reset]);

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
