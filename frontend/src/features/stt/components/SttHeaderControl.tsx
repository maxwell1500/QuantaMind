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

/// The global Speech-to-Text control in the header: an installed-model dropdown +
/// play/stop, its own axis so 1 STT runs alongside 1 LLM. Disabled with a hint
/// until a model is installed (download one in Models → Speech-to-Text). Start
/// failures surface as actionable guidance in a popover, not a silent no-op.
export function SttHeaderControl() {
  const { installed } = useSttCatalog();
  const selectedId = useSttSelectionStore((s) => s.selectedSttModelId);
  const setSelected = useSttSelectionStore((s) => s.setSelectedSttModelId);
  const { start, stop, starting, healthy, error } = useSttServer();

  // Default the global selection to the first installed model.
  useEffect(() => {
    if (!selectedId && installed.length > 0) setSelected(installed[0].id);
  }, [installed, selectedId, setSelected]);

  const none = installed.length === 0;
  const model = installed.find((m) => m.id === selectedId) ?? installed[0] ?? null;

  return (
    <div className="relative" data-testid="header-stt-control">
      <div className="flex items-center gap-1.5 border rounded px-2 py-1" title={healthy ? "STT running" : "STT stopped"}>
        <PlayStopButton
          running={!!healthy}
          busy={starting}
          disabled={none || !model}
          onPlay={() => model && void start(model.model_path, model.vad_path)}
          onStop={() => void stop()}
          title={none ? "Download an STT model first (Models → Speech-to-Text)" : "Start the speech-to-text server"}
          label="speech-to-text"
          playTestId="stt-start"
          stopTestId="stt-stop"
        />
        <span className={dotClass(healthy)} aria-hidden />
        {/* The STT engine (only whisper.cpp today; mlx-whisper / faster-whisper
            will populate this in a later phase), parallel to the LLM backend. */}
        <select
          data-testid="header-stt-engine"
          aria-label="Speech-to-text engine"
          value="whisper_cpp"
          onChange={() => {}}
          className="text-sm bg-transparent outline-none cursor-default"
        >
          <option value="whisper_cpp">whisper.cpp</option>
        </select>
        <select
          data-testid="header-stt-select"
          aria-label="Speech-to-text model"
          value={model?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          disabled={none || !!healthy || starting}
          className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-60"
        >
          {none ? (
            <option value="">Install an STT model…</option>
          ) : (
            installed.map((m) => (
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
