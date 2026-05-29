import type { BackendKind } from "../../../../shared/ipc/models/storage";
import { useUiStore } from "../../../../shared/state/uiStore";
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

/// Collapsible left rail to pick the active inference backend. The Workspace
/// scopes its models and runs to whichever is selected.
export function BackendPanel() {
  const visible = useUiStore((s) => s.backendPanelVisible);
  const toggle = useUiStore((s) => s.toggleBackendPanel);

  if (!visible) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Show backends"
        data-testid="backend-panel-open"
        className="text-gray-500 hover:text-ink px-1 py-1 text-lg self-start"
      >
        ›
      </button>
    );
  }
  return (
    <aside data-testid="backend-panel" className="w-40 shrink-0 border-r pr-2 space-y-0.5">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Backends</span>
        <button
          type="button"
          onClick={toggle}
          aria-label="Hide backends"
          data-testid="backend-panel-close"
          className="text-gray-500 hover:text-ink text-lg leading-none"
        >
          ‹
        </button>
      </div>
      {BACKENDS.map((b) => (
        <BackendRow key={b.id} id={b.id} label={b.label} />
      ))}
    </aside>
  );
}
