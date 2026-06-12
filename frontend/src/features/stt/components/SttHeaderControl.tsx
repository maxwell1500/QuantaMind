import { useEffect } from "react";
import { useSttCatalog } from "../hooks/useSttCatalog";
import { useSttServer } from "../hooks/useSttServer";
import { useSttSelectionStore } from "../state/sttSelectionStore";
import { PlayStopButton } from "../../../shared/ui/PlayStopButton";
import { SttError } from "./SttError";

function dotClass(healthy: boolean | null): string {
  const color = healthy === null ? "bg-gray-300" : healthy ? "bg-green-500" : "bg-gray-400";
  return `inline-block h-2 w-2 rounded-full ${color}`;
}

/// The global Speech-to-Text control: [play/stop] [model ▾], its own axis so one
/// STT (whisper.cpp) runs alongside one LLM. Start failures surface as actionable
/// guidance in a popover.
export function SttHeaderControl() {
  const { healthy, starting, error, start, stop } = useSttServer();
  const cat = useSttCatalog();
  const sel = useSttSelectionStore((s) => s.selectedSttModelId);
  const setSel = useSttSelectionStore((s) => s.setSelectedSttModelId);

  useEffect(() => {
    if (!sel && cat.installed.length > 0) setSel(cat.installed[0].id);
  }, [cat.installed, sel, setSel]);

  const model = cat.installed.find((m) => m.id === sel) ?? cat.installed[0] ?? null;
  const onPlay = () => {
    if (model) void start(model.model_path, model.vad_path);
  };

  return (
    <div className="relative" data-testid="header-stt-control">
      <div className="flex items-center gap-1.5 border rounded px-2 py-1" title={healthy ? "STT running" : "STT stopped"}>
        <PlayStopButton
          running={!!healthy}
          busy={starting}
          disabled={!model}
          onPlay={onPlay}
          onStop={() => void stop()}
          title={model ? "Start the speech-to-text server" : "Download an STT model first"}
          label="speech-to-text"
          playTestId="stt-start"
          stopTestId="stt-stop"
        />
        <span className={dotClass(healthy)} aria-hidden />
        <span className="text-xs font-medium text-gray-500" data-testid="header-stt-engine">
          Whisper.cpp
        </span>
        <select
          data-testid="header-stt-select"
          aria-label="Speech-to-text model"
          value={model?.id ?? ""}
          onChange={(e) => setSel(e.target.value)}
          disabled={cat.installed.length === 0 || !!healthy || starting}
          className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-60"
        >
          {cat.installed.length === 0 ? (
            <option value="">Install an STT model…</option>
          ) : (
            cat.installed.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display}
              </option>
            ))
          )}
        </select>
      </div>
      {error && (
        <div className="absolute right-0 z-20 mt-1 w-72" data-testid="header-stt-error">
          <SttError message={error} />
        </div>
      )}
    </div>
  );
}
