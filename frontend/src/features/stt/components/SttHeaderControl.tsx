import { useEffect } from "react";
import { useSttCatalog } from "../hooks/useSttCatalog";
import { useSttServer } from "../hooks/useSttServer";
import { useMlxSttCatalog } from "../hooks/useMlxSttCatalog";
import { useMlxSttServer } from "../hooks/useMlxSttServer";
import { useMlxSttEnv } from "../hooks/useMlxSttEnv";
import { useSttSelectionStore, type SttEngine } from "../state/sttSelectionStore";
import { PlayStopButton } from "../../../shared/ui/PlayStopButton";
import { SttError } from "./SttError";

function dotClass(healthy: boolean | null): string {
  const color = healthy === null ? "bg-gray-300" : healthy ? "bg-green-500" : "bg-gray-400";
  return `inline-block h-2 w-2 rounded-full ${color}`;
}

/// The global Speech-to-Text control: [play/stop] [engine ▾] [model ▾], its own
/// axis so 1 STT runs alongside 1 LLM. The engine select is real — whisper.cpp
/// always, mlx-audio only on Apple Silicon (excluded entirely otherwise).
/// Switching engine stops the other engine's server (one STT at a time). Start
/// failures surface as actionable guidance in a popover.
export function SttHeaderControl() {
  const engine = useSttSelectionStore((s) => s.engine);
  const setEngine = useSttSelectionStore((s) => s.setEngine);
  const { env: mlxEnv } = useMlxSttEnv();
  const mlxSupported = !!mlxEnv?.supported;

  // Both engines' hooks are always called (Rules of Hooks); only the active
  // engine's values drive the controls.
  const whisper = useSttServer();
  const mlx = useMlxSttServer();
  const whisperCat = useSttCatalog();
  const mlxCat = useMlxSttCatalog();
  const selWhisper = useSttSelectionStore((s) => s.selectedSttModelId);
  const setSelWhisper = useSttSelectionStore((s) => s.setSelectedSttModelId);
  const selMlx = useSttSelectionStore((s) => s.selectedMlxSttRepo);
  const setSelMlx = useSttSelectionStore((s) => s.setSelectedMlxSttRepo);

  useEffect(() => {
    if (!selWhisper && whisperCat.installed.length > 0) setSelWhisper(whisperCat.installed[0].id);
  }, [whisperCat.installed, selWhisper, setSelWhisper]);
  useEffect(() => {
    if (!selMlx && mlxCat.installed.length > 0) setSelMlx(mlxCat.installed[0].repo);
  }, [mlxCat.installed, selMlx, setSelMlx]);

  const isMlx = engine === "mlx_audio";
  const healthy = isMlx ? mlx.healthy : whisper.healthy;
  const starting = isMlx ? mlx.starting : whisper.starting;
  const error = isMlx ? mlx.error : whisper.error;
  const whisperModel = whisperCat.installed.find((m) => m.id === selWhisper) ?? whisperCat.installed[0] ?? null;
  const mlxModel = mlxCat.installed.find((m) => m.repo === selMlx) ?? mlxCat.installed[0] ?? null;

  const onEngineChange = (next: SttEngine) => {
    if (next === engine) return;
    // One STT at a time — stop the engine we're leaving.
    if (isMlx) void mlx.stop();
    else void whisper.stop();
    setEngine(next);
  };

  // mlx-audio loads the model per request, so its server can start without a
  // model selected; whisper.cpp needs the model's path.
  const playDisabled = isMlx ? false : !whisperModel;
  const onPlay = () => {
    if (isMlx) void mlx.start();
    else if (whisperModel) void whisper.start(whisperModel.model_path, whisperModel.vad_path);
  };
  const onStop = () => (isMlx ? void mlx.stop() : void whisper.stop());

  return (
    <div className="relative" data-testid="header-stt-control">
      <div className="flex items-center gap-1.5 border rounded px-2 py-1" title={healthy ? "STT running" : "STT stopped"}>
        <PlayStopButton
          running={!!healthy}
          busy={starting}
          disabled={playDisabled}
          onPlay={onPlay}
          onStop={onStop}
          title={isMlx ? "Start the mlx-audio STT server" : whisperModel ? "Start the speech-to-text server" : "Download an STT model first"}
          label="speech-to-text"
          playTestId="stt-start"
          stopTestId="stt-stop"
        />
        <span className={dotClass(healthy)} aria-hidden />
        <select
          data-testid="header-stt-engine"
          aria-label="Speech-to-text engine"
          value={engine}
          onChange={(e) => onEngineChange(e.target.value as SttEngine)}
          disabled={!!healthy || starting}
          className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-60"
        >
          <option value="whisper_cpp">whisper.cpp</option>
          {mlxSupported && <option value="mlx_audio">mlx-audio</option>}
        </select>
        {isMlx ? (
          <select
            data-testid="header-stt-select"
            aria-label="Speech-to-text model"
            value={mlxModel?.repo ?? ""}
            onChange={(e) => setSelMlx(e.target.value)}
            disabled={mlxCat.installed.length === 0 || !!healthy || starting}
            className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-60"
          >
            {mlxCat.installed.length === 0 ? (
              <option value="">Install an MLX model…</option>
            ) : (
              mlxCat.installed.map((m) => (
                <option key={m.repo} value={m.repo}>
                  {m.display}
                </option>
              ))
            )}
          </select>
        ) : (
          <select
            data-testid="header-stt-select"
            aria-label="Speech-to-text model"
            value={whisperModel?.id ?? ""}
            onChange={(e) => setSelWhisper(e.target.value)}
            disabled={whisperCat.installed.length === 0 || !!healthy || starting}
            className="text-sm bg-transparent outline-none cursor-pointer disabled:opacity-60"
          >
            {whisperCat.installed.length === 0 ? (
              <option value="">Install an STT model…</option>
            ) : (
              whisperCat.installed.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display}
                </option>
              ))
            )}
          </select>
        )}
      </div>
      {error && (
        <div className="absolute right-0 z-20 mt-1 w-72" data-testid="header-stt-error">
          <SttError message={error} />
        </div>
      )}
    </div>
  );
}
