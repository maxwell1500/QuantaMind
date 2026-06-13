import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../shared/ipc/eval/cliff", () => ({
  runContextCliff: vi.fn(),
  getCliffResults: vi.fn().mockResolvedValue({}),
  EVENT_CLIFF_PROGRESS: "cliff-progress",
}));
vi.mock("../../../shared/ipc/eval/registry", () => ({
  getBuiltinCollection: vi.fn(),
  loadCustomCollection: vi.fn(),
}));
vi.mock("../../../shared/ipc/system/inspect", () => ({
  inspectModel: vi.fn(),
  estimateKvCacheBytes: vi.fn(),
}));

import { runContextCliff } from "../../../shared/ipc/eval/cliff";
import { getBuiltinCollection } from "../../../shared/ipc/eval/registry";
import { inspectModel, estimateKvCacheBytes } from "../../../shared/ipc/system/inspect";
import { ContextCliffPanel } from "../components/ContextCliffPanel";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useParamsStore } from "../../../shared/state/paramsStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";

const tasks = [{
  id: "t", category: "single", prompt: "p",
  tools: [{ name: "w", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "call", name: "w", args: {} },
}];

// Backend CliffPoint / CliffReport: one rung = (verified depth, worst composite).
const rung = (verified_tokens: number, composite: number | null) => ({
  target_tokens: verified_tokens, verified_tokens, composite, per_depth: [],
});
type Status = { status: "Collapsed"; depth: number } | { status: "NoCliff"; tested: number } | { status: "Broken"; tested: number };
const reportOf = (status: Status, points: ReturnType<typeof rung>[], cliff_tokens: number | null = null) => ({ points, status, cliff_tokens });

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
  // The probe runs the global header model — select it.
  useSelectedModelStore.setState({ selectedModels: [{ name: "m", backend: "ollama", size_bytes: 1 }] });
  useParamsStore.setState({ globalParams: {} });
  // Bypass real init (IPC) — seed presets so the panel loads its own dataset.
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: [],
    init: vi.fn().mockResolvedValue(undefined),
  });
});

describe("ContextCliffPanel", () => {
  it("defaults the padding source to the Corporate Policy preset", () => {
    render(<ContextCliffPanel />);
    expect((screen.getByTestId("cliff-source-select") as HTMLSelectElement).value).toBe("corporate_policy");
  });

  it("plots the cliff at the model's REAL measured token depth from the backend report", async () => {
    // The backend already padded, swept, verified, and classified — the panel just
    // charts the returned rungs (collapse at the rung verified at ~8300 tokens).
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "Collapsed", depth: 8300 }, [rung(120, 1.0), rung(4200, 1.0), rung(8300, 0.5), rung(12400, 0.4), rung(16500, 0.3)], 4200) as never,
    );
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalledWith("curated"));

    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent("≈8000 context tokens"));
    expect(screen.getByTestId("cliff-chart")).toBeTruthy();
  });

  it("shows 'Not available' for a rung the backend reported no token count for", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "NoCliff", tested: 0 }, [rung(0, 1.0)]) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-panel")).toHaveTextContent("Not available"));
  });

  it("never claims accuracy maintained to a fake '≈0 tokens' when token depth is unreported", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "NoCliff", tested: 0 }, [rung(0, 1.0)]) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent("not reported"));
    expect(screen.getByTestId("cliff-read")).not.toHaveTextContent("≈0");
  });

  it("surfaces a backend error instead of a silent blank chart", async () => {
    vi.mocked(runContextCliff).mockRejectedValue(new Error("server down"));
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-error")).toHaveTextContent("server down"));
  });

  it("reports 'accuracy maintained' when accuracy never collapses", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "NoCliff", tested: 5000 }, [rung(1000, 1.0), rung(5000, 1.0)], 5000) as never,
    );
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent(/Accuracy maintained up to/));
  });

  it("reports a broken baseline instead of falsely 'maintaining' 0% accuracy", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "Broken", tested: 5000 }, [rung(1000, 0.0), rung(5000, 0.0)]) as never,
    );
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));

    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent(/broken baseline/i));
    expect(screen.getByTestId("cliff-read")).not.toHaveTextContent(/maintained/i);
  });

  it("runs the global model + params and forwards the chosen padding source to the backend", async () => {
    useParamsStore.setState({ globalParams: { temperature: 0.2 } });
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "NoCliff", tested: 5000 }, [rung(5000, 1.0)], 5000) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    expect(screen.queryByTestId("cliff-model-select")).toBeNull();
    expect(screen.getByTestId("cliff-model")).toHaveTextContent("m");
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));
    await waitFor(() => expect(runContextCliff).toHaveBeenCalled());
    const call = vi.mocked(runContextCliff).mock.calls[0];
    expect(call[0]).toBe("m"); // model
    expect(call[1]).toBe("ollama"); // backend
    expect(call[4]).toEqual({ kind: "preset", preset: "corporate_policy" }); // source
    // Global params flow through; the backend pins greedy (temp 0) + num_ctx — not the panel.
    expect(call[7]).toEqual({ temperature: 0.2 });
  });

  it("with 2+ selected Ollama models, a dropdown picks which one the probe runs", async () => {
    useSelectedModelStore.setState({ selectedModels: [
      { name: "m", backend: "ollama", size_bytes: 1 },
      { name: "m2", backend: "ollama", size_bytes: 1 },
    ] });
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "NoCliff", tested: 5000 }, [rung(5000, 1.0)], 5000) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    // dropdown appears, listing the selected models; pick the second
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m2" } });
    await waitFor(() => expect(screen.getByTestId("cliff-run")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("cliff-run"));
    await waitFor(() => expect(runContextCliff).toHaveBeenCalled());
    expect(vi.mocked(runContextCliff).mock.calls[0][0]).toBe("m2");
  });

  it("caps the Max Tokens slider at the model's context window", async () => {
    vi.mocked(inspectModel).mockResolvedValue(dims(8192) as never);
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("cliff-max-tokens")).toHaveAttribute("max", "8192"));
  });

  it("pre-fills model + collection + max tokens + steps from a Matrix request and does NOT auto-run", async () => {
    const { useCliffStore } = await import("../state/cliffStore");
    // The Matrix sets this before navigating to Audit.
    useCliffStore.setState({ request: { model: "m2", backend: "ollama", collectionId: "curated", maxTokens: 8192, steps: 7 } });

    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalledWith("curated"));

    // All four fields land pre-selected (the override model, not the header "m").
    expect((screen.getByTestId("cliff-model-select") as HTMLSelectElement).value).toBe("m2");
    expect((screen.getByTestId("cliff-max-tokens") as HTMLInputElement).value).toBe("8192");
    expect((screen.getByTestId("cliff-test-steps") as HTMLInputElement).value).toBe("7");
    // Request is one-shot.
    expect(useCliffStore.getState().request).toBeNull();
    // GUARDRAIL 1: pre-fill only — the probe never starts on navigation.
    expect(runContextCliff).not.toHaveBeenCalled();
  });

  it("re-pre-fills when a NEW request arrives after mount (always-mounted Audit panel)", async () => {
    const { useCliffStore } = await import("../state/cliffStore");
    render(<ContextCliffPanel />);
    await waitFor(() => expect(getBuiltinCollection).toHaveBeenCalled());
    // No request at mount → header model. Then the user clicks Run probe on the Matrix:
    act(() => useCliffStore.setState({ request: { model: "m3", backend: "ollama", collectionId: "curated", maxTokens: 4096, steps: 3 } }));
    await waitFor(() => expect((screen.getByTestId("cliff-model-select") as HTMLSelectElement).value).toBe("m3"));
    expect((screen.getByTestId("cliff-test-steps") as HTMLInputElement).value).toBe("3");
    expect(useCliffStore.getState().request).toBeNull(); // consumed
  });
});
