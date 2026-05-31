import type { BackendKind } from "../../../../shared/ipc/models/storage";
import { useWorkspaceStore } from "../../state/workspaceStore";

const BACKENDS: { id: BackendKind; label: string }[] = [
  { id: "ollama", label: "Ollama" },
  { id: "llama_cpp", label: "llama.cpp" },
];

function dotClass(healthy: boolean | null): string {
  const color = healthy === null ? "bg-gray-300" : healthy ? "bg-green-500" : "bg-gray-400";
  return `inline-block h-2 w-2 rounded-full ${color}`;
}

function BackendRow({ id, label }: { id: BackendKind; label: string }) {
  const active = useWorkspaceStore((s) => s.activeBackend === id);
  const setActive = useWorkspaceStore((s) => s.setActiveBackend);
  const healthy = useWorkspaceStore((s) => (id === "ollama" ? s.ollamaHealthy : s.llamaHealthy));
  // Start/Stop for the active backend lives in the header (ServerControl).
  return (
    <button
      type="button"
      onClick={() => setActive(id)}
      aria-pressed={active}
      data-testid={`backend-${id}`}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded
        ${active ? "bg-blue-50 text-ink font-medium" : "text-gray-600 hover:bg-gray-100"}`}
    >
      <span className={dotClass(healthy)} aria-hidden />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/// The "Backends" section of the workspace rail: pick the active inference
/// backend. The Workspace scopes its models and runs to whichever is selected.
export function BackendList() {
  return (
    <div data-testid="backend-list" className="space-y-0.5">
      <div className="px-2 py-1">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Backends</span>
      </div>
      {BACKENDS.map((b) => (
        <BackendRow key={b.id} id={b.id} label={b.label} />
      ))}
    </div>
  );
}
