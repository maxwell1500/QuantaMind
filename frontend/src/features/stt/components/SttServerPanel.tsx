import { useState } from "react";
import type { InstalledSttModel } from "../../../shared/ipc/stt/stt";
import { useSttServer } from "../hooks/useSttServer";
import { SttError } from "./SttError";

/// Start/stop the whisper-server for a chosen installed model, with a health
/// dot. Start failures render as actionable guidance via SttError (incl. the
/// truncated stderr tail on a crash). Mirrors MlxServerControl.
export function SttServerPanel({ installed }: { installed: InstalledSttModel[] }) {
  const { start, stop, starting, healthy, error } = useSttServer();
  const [selected, setSelected] = useState<string>("");

  if (installed.length === 0) {
    return (
      <p className="text-xs text-gray-500 border-t pt-3">
        Download a model above to start the speech-to-text server.
      </p>
    );
  }
  const model = installed.find((m) => m.id === selected) ?? installed[0];

  return (
    <div className="flex flex-col gap-2 border-t pt-3" data-testid="stt-server-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-gray-300"}`}
          data-testid="stt-health-dot"
        />
        <span className="text-xs text-gray-600">
          {healthy ? "Server ready" : starting ? "Starting…" : "Stopped"}
        </span>
        <select
          value={model.id}
          onChange={(e) => setSelected(e.target.value)}
          disabled={starting || !!healthy}
          className="text-xs border rounded px-1 py-0.5"
          aria-label="Speech model"
        >
          {installed.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display}
            </option>
          ))}
        </select>
        {healthy ? (
          <button type="button" onClick={() => void stop()} className="text-xs border rounded px-3 py-1">
            Stop
          </button>
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={() => void start(model.model_path, model.vad_path)}
            className="text-xs border rounded px-3 py-1 bg-blue-600 text-white disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start"}
          </button>
        )}
      </div>
      {error && <SttError message={error} testid="stt-server-error" />}
    </div>
  );
}
