import { useCallback, useEffect, useRef, useState } from "react";
import { startRecording, stopRecording, recordingLevel } from "../../../shared/ipc/audio/capture";
import { formatIpcError } from "../../../shared/ipc/core/error";

export interface RecordingResult {
  /// Scratch WAV path — the atomic "ready-to-transcribe" signal.
  path: string;
  /// False when the whole take is essentially silent — surfaces "no audio
  /// detected" (muted mic / permission denied) instead of a blank "successful" run.
  hadAudio: boolean;
}

const LEVEL_POLL_MS = 100;

/// Microphone capture via the native (Rust cpal) recorder — WKWebView's
/// getUserMedia is unreliable in the Tauri macOS webview, so audio never touches
/// the webview: Rust captures and hands back a scratch WAV path on stop. While
/// recording, the live RMS level is polled for the meter.
/// Stop-without-Start / double-Stop are no-ops.
export function useMicRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(async () => {
    if (recording) return;
    setError(null);
    try {
      await startRecording();
      setRecording(true);
      pollRef.current = setInterval(() => {
        recordingLevel().then(setLevel).catch(() => {
          /* level is cosmetic — never surface a poll failure */
        });
      }, LEVEL_POLL_MS);
    } catch (e) {
      setError(formatIpcError(e));
    }
  }, [recording]);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    if (!recording) return null; // no-op: stop without record / double stop
    setRecording(false);
    stopPolling();
    try {
      const res = await stopRecording();
      return { path: res.path, hadAudio: res.had_audio };
    } catch (e) {
      setError(formatIpcError(e));
      return null;
    }
  }, [recording, stopPolling]);

  return { start, stop, recording, level, error };
}
