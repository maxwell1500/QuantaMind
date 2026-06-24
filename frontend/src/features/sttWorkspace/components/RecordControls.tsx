import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMicRecorder } from "../hooks/useMicRecorder";
import { useTranscriptStore } from "../state/transcriptStore";

/// Record (mic) or Upload (file) — both converge to an audio path that `onRun`
/// transcribes. A live level meter warns "no audio detected" on a muted mic.
export function RecordControls({ onRun }: { onRun: (path: string) => void }) {
  const { start, stop, recording, level, error } = useMicRecorder();
  const status = useTranscriptStore((s) => s.status);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = status === "transcribing";

  const onStop = async () => {
    const res = await stop();
    if (!res) return; // double-stop / not recording
    if (!res.hadAudio) {
      setNotice(
        "No audio detected — check the mic isn't muted and QuantaMind has microphone access (System Settings → Privacy & Security → Microphone).",
      );
      return;
    }
    setNotice(null);
    onRun(res.path); // returned path = ready-to-transcribe
  };

  const onUpload = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac", "ogg"] }],
    });
    if (typeof picked === "string") onRun(picked);
  };

  return (
    <div className="flex items-center gap-3" data-testid="stt-record-controls">
      {recording ? (
        <button type="button" onClick={() => void onStop()} data-testid="stt-stop"
          className="text-sm border rounded px-3 py-1 bg-red-50 text-red-700">
          ⏹ Stop
        </button>
      ) : (
        <button type="button" onClick={() => void start()} disabled={busy} data-testid="stt-record"
          className="text-sm border rounded px-3 py-1 disabled:opacity-50">
          ● Record
        </button>
      )}
      <button type="button" onClick={() => void onUpload()} disabled={busy || recording} data-testid="stt-upload"
        className="text-sm border rounded px-3 py-1 disabled:opacity-50">
        Upload
      </button>
      {recording && (
        <div className="h-1.5 w-24 bg-gray-200 rounded overflow-hidden" data-testid="stt-level" title="input level">
          <div className="h-full bg-green-500 transition-[width]" style={{ width: `${Math.min(100, level * 300)}%` }} />
        </div>
      )}
      {(notice || error) && (
        <span className="text-xs text-amber-700" data-testid="stt-notice">{notice ?? error}</span>
      )}
    </div>
  );
}
