import { useEffect, useState } from "react";
import { checkOllamaHealth } from "../../../shared/ipc/client";
import type { HealthStatus } from "../../../shared/ipc/types";
import { useWorkspaceStore } from "../state/workspaceStore";

const POLL_MS = 5000;

type Props = {
  model: string | null;
  onModelClick?: () => void;
};

export function StatusBar({ model, onModelClick }: Props) {
  const metrics = useWorkspaceStore((s) => s.lastRunMetrics);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await checkOllamaHealth();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled) setHealth({ available: false, version: null });
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const healthy = health?.available === true;
  const healthLabel = health === null
    ? "checking…"
    : healthy
      ? `connected${health.version ? ` · ${health.version}` : ""}`
      : "Ollama not running";
  const dotClass = healthy ? "bg-green-500" : "bg-red-500";

  return (
    <footer
      data-testid="status-bar"
      className="fixed bottom-0 left-0 right-0 h-10 px-3 flex items-center justify-between text-xs font-mono border-t bg-white"
    >
      <button
        type="button"
        onClick={onModelClick}
        className="hover:underline disabled:no-underline"
        disabled={!onModelClick}
      >
        {model ?? "no model"}
      </button>
      <span className="flex items-center gap-1.5" aria-label="Ollama health">
        <span className={`inline-block w-2 h-2 rounded-full ${dotClass}`} />
        {healthLabel}
      </span>
      <span data-testid="status-bar-metrics">
        {metrics ? (
          <>
            TTFT {metrics.ttft_ms ?? "—"}ms ·{" "}
            {metrics.tokens_per_sec?.toFixed(1) ?? "—"} tok/s ·{" "}
            {metrics.token_count} tokens
          </>
        ) : (
          "no run yet"
        )}
      </span>
    </footer>
  );
}
