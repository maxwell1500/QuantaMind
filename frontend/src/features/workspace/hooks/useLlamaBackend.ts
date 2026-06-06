import { useEffect } from "react";
import { checkLlamaHealth } from "../../../shared/ipc/core/client";
import { useBackendStore } from "../../../shared/state/backendStore";

const POLL_MS = 5000;

// Polls the llama.cpp sidecar's health into the store every 5s — matching how
// Ollama (StatusBar) and MLX (useMlxBackend) are polled. Without this, llamaHealthy
// was only set true on a successful start and never re-probed, so the status went
// stale (still "healthy") after the server died. llama.cpp runs on any platform, so
// there's no Apple-Silicon gate.
export function useLlamaBackend(): void {
  const setLlamaHealthy = useBackendStore((s) => s.setLlamaHealthy);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await checkLlamaHealth();
        if (!cancelled) setLlamaHealthy(h.available);
      } catch {
        if (!cancelled) setLlamaHealthy(false);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [setLlamaHealthy]);
}
