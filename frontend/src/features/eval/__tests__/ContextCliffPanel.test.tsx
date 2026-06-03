import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../shared/ipc/eval/toolcall", () => ({ runToolcallEval: vi.fn() }));
vi.mock("../../../shared/ipc/eval/registry", () => ({
  getBuiltinCollection: vi.fn(),
  loadCustomCollection: vi.fn(),
}));
vi.mock("../../../shared/ipc/system/inspect", () => ({
  inspectModel: vi.fn(),
  estimateKvCacheBytes: vi.fn(),
}));

import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import { getBuiltinCollection } from "../../../shared/ipc/eval/registry";
import { inspectModel, estimateKvCacheBytes } from "../../../shared/ipc/system/inspect";
import { ContextCliffPanel } from "../components/ContextCliffPanel";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";

const tasks = [{
  id: "t", category: "single", prompt: "p",
  tools: [{ name: "w", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "call", name: "w", args: {} },
}];

const report = (composite: number, promptTokens: number | null = null) => ({
  n: 1, parse_rate: composite, tool_selection_acc: composite, arg_acc: composite,
  abstain_acc: null, composite, prompt_tokens: promptTokens, per_task: [],
});

const dims = (context_length: number) => ({
  available: true, note: null, template: "", capabilities: [], family: null,
  parameter_size: null, quantization: null, is_base_guess: false, base_reason: null,
  dims: { layers: 0, head_count: 0, head_count_kv: 0, embedding_length: 0, context_length },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBuiltinCollection).mockResolvedValue(tasks as never);
  vi.mocked(inspectModel).mockResolvedValue({ dims: null } as never);
  vi.mocked(estimateKvCacheBytes).mockResolvedValue(0 as never);
  useInstalledModelsStore.setState({
    list: [{ name: "m", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "", backend: "ollama" }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
  // Bypass real init (IPC) — seed presets so the panel loads its own dataset.
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: [],
    init: vi.fn().mockResolvedValue(undefined),
  });
});

describe("ContextCliffPanel", () => {
  it("loads its own dataset and plots the cliff at the model's REAL measured token depth", async () => {
    // (composite, measured prompt_eval_count) per rung — accuracy collapses at
    // the rung the model measured at ~8300 prompt tokens.
    const seq: [number, number][] = [[1.0, 120], [1.0, 4200], [0.5, 8300], [0.4, 12400], [0.3, 16500]];
    let i = 0;
    vi.mocked(runToolcallEval).mockImplementation(() => {
      const [c, t] = seq[i++];
      return Promise.resolve(report(c, t) as never);
    });
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalledWith("curated"));

    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent("≈8000 context tokens"));
    expect(screen.getByTestId("cliff-chart")).toBeTruthy();
  });

  it("shows 'Not available' for a rung the backend reported no token count for", async () => {
    vi.mocked(runToolcallEval).mockResolvedValue(report(1.0, null) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-panel")).toHaveTextContent("Not available"));
  });

  it("surfaces a backend error instead of a silent blank chart", async () => {
    vi.mocked(runToolcallEval).mockRejectedValue(new Error("server down"));
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-error")).toHaveTextContent("server down"));
  });

  it("reports 'accuracy maintained' when accuracy never collapses", async () => {
    vi.mocked(runToolcallEval).mockResolvedValue(report(1.0, 5000) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent(/Accuracy maintained up to/));
  });

  it("caps the Max Tokens slider at the model's context window", async () => {
    vi.mocked(inspectModel).mockResolvedValue(dims(8192) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    await waitFor(() => expect(screen.getByTestId("cliff-max-tokens")).toHaveAttribute("max", "8192"));
  });
});
