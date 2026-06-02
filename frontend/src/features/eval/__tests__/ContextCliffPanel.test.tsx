import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../shared/ipc/eval/toolcall", () => ({ runToolcallEval: vi.fn() }));

import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import { ContextCliffPanel } from "../components/ContextCliffPanel";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";

const report = (composite: number) => ({
  n: 1, parse_rate: composite, tool_selection_acc: composite, arg_acc: composite,
  abstain_acc: null, composite, per_task: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  useInstalledModelsStore.setState({
    list: [{ name: "m", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "", backend: "ollama" }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
  useEvalRegistryStore.setState({
    tasks: [{ id: "t", category: "single", prompt: "p", tools: [{ name: "w", description: "", parameters: { type: "object", properties: {} } }], expected: { type: "call", name: "w", args: {} } }] as never,
  });
});

describe("ContextCliffPanel", () => {
  it("runs the ladder and reports the approximate cliff", async () => {
    // Composite collapses as padding grows: 1, 1, 0.5, 0.4, 0.3 → cliff at step 3 (8000 approx tokens).
    const seq = [1.0, 1.0, 0.5, 0.4, 0.3];
    let i = 0;
    vi.mocked(runToolcallEval).mockImplementation(() => Promise.resolve(report(seq[i++]) as never));
    render(<ContextCliffPanel />);
    fireEvent.change(screen.getByTestId("cliff-model-select"), { target: { value: "m" } });
    fireEvent.click(screen.getByTestId("cliff-run"));
    await waitFor(() => expect(screen.getByTestId("cliff-read")).toHaveTextContent("≈8000 context tokens"));
    expect(screen.getByTestId("cliff-chart")).toBeTruthy();
  });
});
