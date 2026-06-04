import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
// The probe has its own suite; stub it. The timeline renders the models it got so
// we can assert the backend filter.
vi.mock("../../eval/components/ContextCliffPanel", () => ({ ContextCliffPanel: () => <div data-testid="cliff-panel" /> }));
vi.mock("../../eval/components/matrix/HistoryTimeline", () => ({
  HistoryTimeline: ({ history }: { history: { model: string }[] }) => (
    <div data-testid="history-timeline">{history.map((h) => h.model).join(",")}</div>
  ),
}));

import { invoke } from "@tauri-apps/api/core";
import { AuditPage } from "../components/AuditPage";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useBackendStore } from "../../../shared/state/backendStore";

const summary = (model: string, backend: "ollama" | "llama_cpp") => ({
  ts: "2026-06-01T00:00:00Z", model, backend,
  parse_rate: null, tool_selection_acc: null, arg_acc: null, abstain_acc: null,
  composite: 0.8, n: 5,
});

beforeEach(() => {
  vi.clearAllMocks();
  useBackendStore.setState({ selectedBackend: "ollama" });
  useEvalRegistryStore.setState({ presets: [{ id: "curated", label: "Curated Suite" }], collections: [], init: vi.fn().mockResolvedValue(undefined) });
});

describe("AuditPage", () => {
  it("mounts the saved-history section, the export, and the Context-Cliff probe", async () => {
    render(<AuditPage />);
    expect(screen.getByTestId("tab-audit")).toBeInTheDocument();
    expect(screen.getByTestId("audit-history")).toBeInTheDocument();
    expect(screen.getByTestId("audit-export-csv")).toBeDisabled(); // no run yet
    expect(screen.getByTestId("cliff-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());
  });

  it("shows only the selected backend's models in the history (not the previous backend's)", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "load_collection_history")
        return Promise.resolve([summary("llama3", "ollama"), summary("qwen.gguf", "llama_cpp")]);
      return Promise.resolve([]);
    });
    useBackendStore.setState({ selectedBackend: "llama_cpp" });
    render(<AuditPage />);
    await waitFor(() => expect(screen.getByTestId("history-timeline")).toHaveTextContent("qwen.gguf"));
    expect(screen.getByTestId("history-timeline")).not.toHaveTextContent("llama3");
  });
});
