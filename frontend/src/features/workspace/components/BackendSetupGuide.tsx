import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useNavStore } from "../../../shared/state/navStore";
import { useMlxBackend } from "../hooks/useMlxBackend";
import { useStartOllama } from "../hooks/useStartOllama";

type Step = { text: string; href?: string };
type Engine = {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  runs: string;
  steps: Step[];
  appleOnly?: boolean;
};

const ENGINES: Engine[] = [
  {
    id: "ollama",
    name: "Ollama",
    tag: "Easiest",
    blurb: "Manages and runs models for you — the best place to start.",
    runs: "Llama 3.2, Qwen 2.5, Phi, Mistral, Gemma… (GGUF)",
    steps: [
      { text: "Install Ollama", href: "https://ollama.com/download" },
      { text: "QuantaMind starts it for you (or press ▶ in the header)." },
      { text: "Pull a model in the Models tab — try llama3.2:1b (~700 MB)." },
    ],
  },
  {
    id: "llama_cpp",
    name: "llama.cpp",
    tag: "Bundled — no install",
    blurb: "Runs a single GGUF directly via the bundled llama-server.",
    runs: "Any .gguf file from Hugging Face",
    steps: [
      { text: "Download a GGUF — Models → Hugging Face or Local File." },
      { text: "Pick llama.cpp + your model in the header, then press ▶." },
    ],
  },
  {
    id: "mlx",
    name: "MLX",
    tag: "Apple Silicon",
    blurb: "Apple-Silicon-native inference via mlx_lm.server.",
    runs: "mlx-community models (4-bit / 8-bit)",
    appleOnly: true,
    steps: [
      { text: "Install mlx-lm: pip install mlx-lm", href: "https://github.com/ml-explore/mlx-lm" },
      { text: "Download an MLX model — Models → Hugging Face." },
      { text: "Pick MLX + your model in the header, then press ▶." },
    ],
  },
  {
    id: "whisper",
    name: "whisper.cpp",
    tag: "Speech-to-Text",
    blurb: "Local speech-to-text — its own engine, runs alongside an LLM.",
    runs: "Whisper tiny / base / small / medium / large-v3",
    steps: [
      { text: "Install: brew install whisper-cpp", href: "https://github.com/ggml-org/whisper.cpp" },
      { text: "Download a model — Models → Speech-to-Text." },
      { text: "Pick a model in the STT header group, then press ▶." },
    ],
  },
];

function StepLine({ n, step }: { n: number; step: Step }) {
  return (
    <li className="flex gap-1.5">
      <span className="text-gray-400 tabular-nums">{n}.</span>
      {step.href ? (
        <button
          type="button"
          onClick={() => void openExternal(step.href!)}
          className="text-left text-blue-700 hover:underline"
        >
          {step.text} ↗
        </button>
      ) : (
        <span>{step.text}</span>
      )}
    </li>
  );
}

function EngineCard({ engine, onStartOllama, ollamaBusy }: { engine: Engine; onStartOllama: () => void; ollamaBusy: boolean }) {
  return (
    <div data-testid={`setup-engine-${engine.id}`} className="border rounded-lg p-4 flex flex-col gap-2 bg-surface">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{engine.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500 border rounded px-1.5 py-0.5">{engine.tag}</span>
      </div>
      <p className="text-xs text-gray-600">{engine.blurb}</p>
      <p className="text-xs text-gray-500">
        <span className="text-gray-400">Runs:</span> {engine.runs}
      </p>
      <ol className="text-xs text-gray-700 flex flex-col gap-1 mt-1">
        {engine.steps.map((s, i) => (
          <StepLine key={s.text} n={i + 1} step={s} />
        ))}
      </ol>
      {engine.id === "ollama" && (
        <button
          type="button"
          onClick={onStartOllama}
          disabled={ollamaBusy}
          data-testid="setup-start-ollama"
          className="self-start text-xs border rounded px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {ollamaBusy ? "Starting…" : "Start Ollama"}
        </button>
      )}
    </div>
  );
}

/// Shown in the workspace when no LLM backend is running: a step-by-step guide to
/// install/start each engine (Ollama, llama.cpp, MLX, whisper.cpp) with links and
/// what each runs. The moment a server comes up, the workspace switches to the
/// prompt UI (the health poll in StatusBar / the header drives that).
export function BackendSetupGuide() {
  const goToModels = useNavStore((s) => s.setTopView);
  const { appleSilicon } = useMlxBackend();
  const { start, status } = useStartOllama();
  const engines = ENGINES.filter((e) => !e.appleOnly || appleSilicon);

  return (
    <div data-testid="backend-setup-guide" className="flex flex-col gap-4 px-2 py-4">
      <div>
        <h2 className="text-lg font-semibold">Connect a backend to start running models</h2>
        <p className="text-sm text-gray-600">
          QuantaMind runs models through a local server. Set up at least one below — this
          page switches to the prompt editor the moment a server is running.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {engines.map((e) => (
          <EngineCard
            key={e.id}
            engine={e}
            onStartOllama={() => void start()}
            ollamaBusy={status === "starting"}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => goToModels("models")}
        data-testid="setup-open-models"
        className="self-start text-sm border rounded px-3 py-1 hover:bg-gray-50"
      >
        Open the Models tab to download models →
      </button>
    </div>
  );
}
