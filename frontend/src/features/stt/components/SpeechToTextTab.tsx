import { useMlxSttEnv } from "../hooks/useMlxSttEnv";
import { useSttSelectionStore, type SttEngine } from "../state/sttSelectionStore";
import { WhisperSttPanel } from "./WhisperSttPanel";
import { MlxSttPanel } from "./MlxSttPanel";

const ENGINES: { id: SttEngine; label: string }[] = [
  { id: "whisper_cpp", label: "whisper.cpp" },
  { id: "mlx_audio", label: "mlx-audio" },
];

/// The Speech-to-Text tab, routed by the global STT engine. The engine toggle
/// shows mlx-audio only on Apple Silicon (excluded entirely otherwise); each
/// engine has its own setup + catalog.
export function SpeechToTextTab() {
  const engine = useSttSelectionStore((s) => s.engine);
  const setEngine = useSttSelectionStore((s) => s.setEngine);
  const { env: mlxEnv } = useMlxSttEnv();
  const mlxSupported = !!mlxEnv?.supported;
  const isMlx = engine === "mlx_audio" && mlxSupported;

  return (
    <div className="flex flex-col gap-3" data-testid="speech-to-text-tab">
      {mlxSupported && (
        <div className="flex rounded border overflow-hidden text-xs self-start" role="group" aria-label="Speech-to-text engine">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setEngine(e.id)}
              aria-pressed={engine === e.id}
              data-testid={`stt-engine-tab-${e.id}`}
              className={`px-3 py-1 ${engine === e.id ? "bg-blue-600 text-white" : "bg-surface hover:bg-gray-100"}`}
            >
              {e.label}
            </button>
          ))}
        </div>
      )}
      {isMlx ? <MlxSttPanel /> : <WhisperSttPanel />}
    </div>
  );
}
