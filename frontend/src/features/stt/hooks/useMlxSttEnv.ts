import { useCallback, useEffect, useRef, useState } from "react";
import { checkMlxSttEnv, type MlxSttEnv } from "../../../shared/ipc/stt/mlxStt";

/// Is the mlx-audio STT engine usable here? `supported` = Apple Silicon (the only
/// place mlx-audio runs — used to gate the engine in/out of the UI); `found` =
/// mlx_audio.server installed. Re-checkable (after `pip install "mlx-audio[server]"`),
/// guarded against re-entrant clicks.
export function useMlxSttEnv() {
  const [env, setEnv] = useState<MlxSttEnv | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);

  const recheck = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      setEnv(await checkMlxSttEnv());
    } catch {
      setEnv({ supported: false, found: false, dir: null });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { env, loading, recheck };
}
