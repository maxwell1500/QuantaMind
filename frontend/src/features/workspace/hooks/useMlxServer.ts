import { useCallback, useEffect, useRef, useState } from "react";
import { startMlxServer, stopMlxServer, mlxServerStatus } from "../../../shared/ipc/models/mlx_start";
import { checkMlxHealth } from "../../../shared/ipc/core/client";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useBackendStore } from "../../../shared/state/backendStore";

const POLL_MS = 1500;
const NOT_FOUND = "mlx_lm.server not found — install mlx-lm (pip install mlx-lm) or set its path.";
const NO_PORT = "No free port in 8082–8092. Stop another server and retry.";

export type MlxPhaseLabel = "downloading" | "starting" | null;

/// Start/stop the app-managed mlx_lm.server. Start returns immediately and then
/// polls status + health — so a multi-minute first-run download shows
/// "Downloading weights…" without ever failing by timeout; a died process
/// surfaces its stderr tail instead of spinning forever.
export function useMlxServer() {
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<MlxPhaseLabel>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => () => clear(), []);

  const settle = useCallback((healthy: boolean, msg: string | null) => {
    clear();
    setStarting(false);
    setPhase(null);
    if (msg) setError(msg);
    useBackendStore.getState().setMlxHealthy(healthy);
  }, []);

  const poll = useCallback(async () => {
    try {
      if ((await checkMlxHealth()).available) return settle(true, null);
      const st = await mlxServerStatus();
      if (st.state === "exited") settle(false, st.stderr_tail || `mlx_lm.server exited (code ${st.code ?? "?"})`);
      else if (st.state === "running") setPhase(st.phase === "downloading" ? "downloading" : "starting");
    } catch (e) {
      settle(false, formatIpcError(e));
    }
  }, [settle]);

  const start = useCallback(async (modelPath: string) => {
    setError(null);
    setStarting(true);
    setPhase("starting");
    try {
      const r = await startMlxServer(modelPath);
      if (r.status === "not_found") return settle(false, NOT_FOUND);
      if (r.status === "no_free_port") return settle(false, NO_PORT);
      if (r.status === "start_failed") return settle(false, r.error);
      clear();
      timer.current = setInterval(() => void poll(), POLL_MS);
      void poll();
    } catch (e) {
      settle(false, formatIpcError(e));
    }
  }, [poll, settle]);

  const stop = useCallback(async () => {
    setError(null);
    try {
      await stopMlxServer();
    } catch {
      /* best-effort */
    }
    settle(false, null);
  }, [settle]);

  return { start, stop, starting, phase, error };
}
