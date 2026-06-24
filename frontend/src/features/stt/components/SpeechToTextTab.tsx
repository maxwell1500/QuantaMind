import { WhisperSttPanel } from "./WhisperSttPanel";

/// The Speech-to-Text tab — whisper.cpp setup + catalog.
export function SpeechToTextTab() {
  return (
    <div className="flex flex-col gap-3" data-testid="speech-to-text-tab">
      <WhisperSttPanel />
    </div>
  );
}
