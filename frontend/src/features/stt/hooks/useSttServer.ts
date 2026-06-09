import { useCallback, useEffect, useState } from "react";
import {
  startWhisperServer,
  stopWhisperServer,
  checkWhisperHealth,
} from "../../../shared/ipc/stt/stt";
import { formatIpcError } from "../../../shared/ipc/core/error";

const POLL_MS = 2000;

/// Start/stop the single whisper-server and track its health. A continuous
/// /health poll keeps `healthy` live — so the header dot reflects a server
/// started elsewhere (e.g. from the STT tab), and the spinner clears the moment
/// the model finishes loading. start branches on the tagged SttStartResult so
/// each failure yields an actionable message (rendered via SttError).
export function useSttServer() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const ok = (await checkWhisperHealth()).available;
        if (cancelled) return;
        setHealthy(ok);
        if (ok) setStarting(false);
      } catch {
        if (!cancelled) setHealthy(false);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const start = useCallback(async (modelPath: string, vadPath: string) => {
    setError(null);
    setStarting(true);
    try {
      const r = await startWhisperServer(modelPath, vadPath);
      if (r.status === "already_running" || r.status === "started") return; // poll flips healthy + clears starting
      setStarting(false);
      if (r.status === "start_failed") setError(`${r.error}\n${r.stderr_tail}`);
      else setError(r.note); // not_bundled | model_missing | vad_missing | port_conflict
    } catch (e) {
      setStarting(false);
      setError(formatIpcError(e));
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      await stopWhisperServer();
    } catch {
      /* best-effort */
    }
    setHealthy(false);
    setStarting(false);
  }, []);

  return { start, stop, starting, healthy, error };
}
