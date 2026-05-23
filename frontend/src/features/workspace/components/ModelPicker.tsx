import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { listModels } from "../../../shared/ipc/client";
import { formatIpcError } from "../../../shared/ipc/error";
import { useWorkspaceStore } from "../state/workspaceStore";

type Props = {
  value: string | null;
  onChange: (model: string) => void;
  onAddClick?: () => void;
};

const EVENT_MODELS_CHANGED = "models-changed";

export function ModelPicker({ value, onChange, onAddClick }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const wasHealthy = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    const refresh = () =>
      listModels()
        .then((list) => {
          if (!cancelled) {
            setModels(list);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(formatIpcError(e));
        });

    refresh();
    (async () => {
      const u = await listen(EVENT_MODELS_CHANGED, () => {
        refresh();
      });
      if (cancelled) u(); else unsub = u;
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // When StatusBar detects Ollama has come back up, refresh once.
  useEffect(() => {
    if (ollamaHealthy === true && wasHealthy.current !== true) {
      listModels()
        .then((list) => { setModels(list); setError(null); })
        .catch((e) => setError(formatIpcError(e)));
    }
    wasHealthy.current = ollamaHealthy;
  }, [ollamaHealthy]);

  const effectiveError = error
    ?? (ollamaHealthy === false ? "Ollama is not running. Start Ollama and try again." : null);

  return (
    <div className="flex gap-2 items-center">
      {effectiveError ? (
        <div role="alert" className="text-red-600 text-sm flex-1">
          {effectiveError}
        </div>
      ) : (
        <select
          aria-label="Model"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="" disabled>
            Pick a model
          </option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          aria-label="Add model"
          className="border rounded px-2 py-1 text-sm leading-none"
        >
          +
        </button>
      )}
    </div>
  );
}
