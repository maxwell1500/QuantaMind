import { useEffect, useState } from "react";
import { getHardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { checkMlxHealth } from "../../../shared/ipc/core/client";
import { useWorkspaceStore } from "../state/workspaceStore";

const POLL_MS = 5000;

// Detects Apple Silicon (the only platform where mlx_lm.server can run) and,
// when present, polls MLX health into the store. Off Apple Silicon MLX is never
// offered, so no polling happens.
export function useMlxBackend(): { appleSilicon: boolean } {
  const [appleSilicon, setAppleSilicon] = useState(false);
  const setMlxHealthy = useWorkspaceStore((s) => s.setMlxHealthy);

  useEffect(() => {
    let cancelled = false;
    getHardwareSnapshot()
      .then((hw) => !cancelled && setAppleSilicon(hw.is_apple_silicon))
      .catch(() => !cancelled && setAppleSilicon(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!appleSilicon) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await checkMlxHealth();
        if (!cancelled) setMlxHealthy(h.available);
      } catch {
        if (!cancelled) setMlxHealthy(false);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [appleSilicon, setMlxHealthy]);

  return { appleSilicon };
}
