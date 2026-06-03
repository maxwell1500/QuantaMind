import { useEffect, useState } from "react";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useMlxServer } from "../../hooks/useMlxServer";

const DEFAULT_REPO = "mlx-community/Llama-3.2-3B-Instruct-4bit";

/// Start/Stop for the app-managed mlx_lm.server. Start launches it on the typed
/// HF repo (mlx_lm downloads it on first run); once healthy it appears in the
/// model dropdown. Shows the download/start phase and any launch error.
export function MlxServerControl() {
  const healthy = useWorkspaceStore((s) => s.mlxHealthy);
  const prefill = useWorkspaceStore((s) => s.mlxRepo);
  const [repo, setRepo] = useState(prefill ?? DEFAULT_REPO);
  const { start, stop, starting, phase, error } = useMlxServer();

  // A repo picked from HuggingFace search lands here — adopt it in the input
  // (the user still clicks Start, since the first run downloads several GB).
  useEffect(() => {
    if (prefill) setRepo(prefill);
  }, [prefill]);

  const trimmed = repo.trim();
  // Even while a server is running, keep the repo field + a "Switch model"
  // action: start_mlx_server stops the current model and loads the new one.
  // (Without this a prefilled repo had nowhere to go once one was running.)
  const label = starting
    ? phase === "downloading"
      ? "Downloading weights…"
      : "Starting…"
    : healthy
      ? "Switch model"
      : "Start MLX";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          disabled={starting}
          placeholder="mlx-community/…"
          data-testid="mlx-repo-input"
          className="border rounded px-1.5 py-0.5 text-xs w-56"
        />
        <button
          type="button"
          onClick={() => trimmed && void start(trimmed)}
          disabled={starting || !trimmed}
          data-testid="mlx-start"
          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 disabled:opacity-40"
        >
          {label}
        </button>
        {healthy && !starting && (
          <button
            type="button"
            onClick={() => void stop()}
            data-testid="mlx-stop"
            className="text-xs text-gray-600 hover:text-ink px-2 py-1"
          >
            Stop MLX
          </button>
        )}
      </div>
      {error && (
        <p data-testid="mlx-start-error" className="px-2 text-[10px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
