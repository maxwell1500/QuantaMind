import { useCallback, useEffect, useState } from "react";
import { startMlxSttServer, stopMlxSttServer, mlxSttStatus } from "../../../shared/ipc/stt/mlxStt";
import { formatIpcError } from "../../../shared/ipc/core/error";

const POLL_MS = 2000;

/// Start/stop the mlx-audio STT server + track its status. mlx-audio loads the
/// model per request, so `Running` = listening = ready. Continuous poll keeps
/// `healthy` live (reflects a server started elsewhere). start branches on the
/// tagged MlxSttStartResult; `not_found` → install mlx-audio.
export function useMlxSttServer() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const st = await mlxSttStatus();
        if (cancelled) return;
        if (st.state === "running") {
          setHealthy(true);
          setStarting(false);
        } else if (st.state === "exited") {
          setHealthy(false);
          setStarting(false);
          setError(st.stderr_tail || `mlx-audio exited (code ${st.code ?? "?"})`);
        } else {
          setHealthy(false);
        }
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

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const r = await startMlxSttServer();
      if (r.status === "already_running" || r.status === "started") return; // poll flips healthy
      setStarting(false);
      if (r.status === "not_found") {
        setError("mlx-audio isn't installed. Run `pip install mlx-audio`, then retry.");
      } else if (r.status === "no_free_port") {
        setError(r.note);
      } else {
        setError(`${r.error}\n${r.stderr_tail}`);
      }
    } catch (e) {
      setStarting(false);
      setError(formatIpcError(e));
    }
  }, []);

  const stop = useCallback(async () => {
    setError(null);
    try {
      await stopMlxSttServer();
    } catch {
      /* best-effort */
    }
    setHealthy(false);
    setStarting(false);
  }, []);

  return { start, stop, starting, healthy, error };
}
