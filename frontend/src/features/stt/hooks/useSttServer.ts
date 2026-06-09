import { useCallback, useEffect, useRef, useState } from "react";
import {
  startWhisperServer,
  stopWhisperServer,
  checkWhisperHealth,
} from "../../../shared/ipc/stt/stt";
import { formatIpcError } from "../../../shared/ipc/core/error";

const POLL_MS = 1500;

/// Start/stop the whisper-server, mirroring useMlxServer: start branches on the
/// tagged SttStartResult (each failure → an actionable message), then polls
/// /health until ready. start_failed surfaces the stderr tail; the gating
/// statuses surface their note. The caller renders the message via SttError.
export function useSttServer() {
  const [starting, setStarting] = useState(false);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => clear(), []);

  const settle = useCallback((ok: boolean, msg: string | null) => {
    clear();
    setStarting(false);
    setHealthy(ok);
    if (msg) setError(msg);
  }, []);

  const poll = useCallback(async () => {
    try {
      if ((await checkWhisperHealth()).available) settle(true, null);
    } catch (e) {
      settle(false, formatIpcError(e));
    }
  }, [settle]);

  const start = useCallback(
    async (modelPath: string, vadPath: string) => {
      setError(null);
      setStarting(true);
      try {
        const r = await startWhisperServer(modelPath, vadPath);
        if (r.status === "already_running" || r.status === "started") {
          clear();
          timer.current = setInterval(() => void poll(), POLL_MS);
          void poll();
          return;
        }
        if (r.status === "start_failed") {
          return settle(false, `${r.error}\n${r.stderr_tail}`);
        }
        // not_bundled | model_missing | vad_missing | port_conflict
        return settle(false, r.note);
      } catch (e) {
        settle(false, formatIpcError(e));
      }
    },
    [poll, settle],
  );

  const stop = useCallback(async () => {
    setError(null);
    try {
      await stopWhisperServer();
    } catch {
      /* best-effort */
    }
    settle(false, null);
  }, [settle]);

  return { start, stop, starting, healthy, error };
}
