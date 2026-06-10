import { useCallback, useEffect } from "react";
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
/// Works on either engine: whisper.cpp uses its running model; mlx-audio needs
/// the selected repo passed as `model` (it loads per request).
export function SttWorkspace({ engine, model }: { engine: RunningSttEngine; model?: string | null }) {
  const { run } = useTranscription();
  const reset = useTranscriptStore((s) => s.reset);

  // Transient: clear the live transcript on leave (disk is the source of truth).
  useEffect(() => () => reset(), [reset]);

  // The mlx-audio model rides with each run; whisper.cpp ignores it.
  const onRun = useCallback((path: string) => run(path, engine === "mlx_audio" ? model : null), [run, engine, model]);

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
