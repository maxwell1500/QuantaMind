import type { BackendKind } from "./shared/ipc/models/storage";
import { useBackendStore } from "./shared/state/backendStore";
import { useMlxBackend } from "./features/workspace/hooks/useMlxBackend";
import { useLlamaBackend } from "./features/workspace/hooks/useLlamaBackend";

const BASE_BACKENDS: { id: BackendKind; label: string }[] = [
  { id: "ollama", label: "Ollama" },
  { id: "llama_cpp", label: "llama.cpp" },
];

function dotClass(healthy: boolean | null): string {
  const color = healthy === null ? "bg-gray-300" : healthy ? "bg-green-500" : "bg-gray-400";
  return `inline-block h-2 w-2 rounded-full ${color}`;
}

function BackendButton({ id, label }: { id: BackendKind; label: string }) {
  const active = useBackendStore((s) => s.selectedBackend === id);
  const setActive = useBackendStore((s) => s.setSelectedBackend);
  const healthy = useBackendStore((s) =>
    id === "ollama" ? s.ollamaHealthy : id === "mlx" ? s.mlxHealthy : s.llamaHealthy,
  );
  return (
    <button
      type="button"
      onClick={() => setActive(id)}
      aria-pressed={active}
      data-testid={`header-backend-${id}`}
      className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded
        ${active ? "bg-blue-50 text-ink font-medium" : "text-gray-600 hover:bg-gray-100"}`}
    >
      <span className={dotClass(healthy)} aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/// The global backend picker in the header. The whole app scopes its model list
/// and runs to the selected backend (architecture.md rule 7). MLX shows only on
/// Apple Silicon, where mlx_lm.server can run; useMlxBackend polls MLX health and
/// useLlamaBackend polls llama.cpp health into backendStore (Ollama is polled by
/// the StatusBar) so all three header dots stay live.
export function BackendSelector() {
  const { appleSilicon } = useMlxBackend();
  useLlamaBackend();
  const backends = appleSilicon
    ? [...BASE_BACKENDS, { id: "mlx" as BackendKind, label: "MLX" }]
    : BASE_BACKENDS;
  return (
    <div data-testid="header-backend-selector" className="flex items-center gap-0.5 border rounded px-0.5">
      {backends.map((b) => (
        <BackendButton key={b.id} id={b.id} label={b.label} />
      ))}
    </div>
  );
}
