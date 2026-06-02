import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue(new Error("no hw")) }));
vi.mock("../../../shared/ipc/eval/evals", () => ({
  listEvals: vi.fn().mockResolvedValue([
    { id: "a", category: "x", prompt: "p", scoring: {} },
    { id: "b", category: "x", prompt: "p", scoring: {} },
  ]),
  runEvalTask: vi.fn().mockResolvedValue({ task_id: "a", category: "x", passed: true, detail: "", output: "", token_count: 1 }),
}));

import { QuantPage } from "../components/QuantPage";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import type { BackendKind } from "../../../shared/ipc/models/storage";

const GB = 1024 ** 3;
const variant = (q: string, gb: number, backend: BackendKind) => ({
  name: `llama-7b-${q}`, size_bytes: gb * GB, modified_at: "",
  family: "Llama", parameter_size: "7B", quantization: q, backend,
});
const setModels = (backend: BackendKind) =>
  useInstalledModelsStore.setState({
    list: [variant("Q4_K_M", 4, backend), variant("Q8_0", 8, backend)],
    status: "ready", error: null, lastRefreshedAt: 1,
  });

beforeEach(() => vi.clearAllMocks());

describe("QuantPage", () => {
  it("lists the model's quant variants and a recommendation", () => {
    setModels("ollama");
    render(<QuantPage />);
    expect(screen.getByTestId("quant-variant-Q4_K_M")).toBeTruthy();
    expect(screen.getByTestId("quant-variant-Q8_0")).toBeTruthy();
    expect(screen.getByTestId("quant-recommendation")).toBeTruthy();
  });

  it("runs the eval suite per Ollama variant and fills the quality column", async () => {
    setModels("ollama");
    render(<QuantPage />);
    fireEvent.click(screen.getByTestId("quant-run-evals"));
    await waitFor(() => expect(screen.getByTestId("quant-quality-Q4_K_M")).toHaveTextContent("2/2"));
    expect(screen.getByTestId("quant-quality-Q8_0")).toHaveTextContent("2/2");
  });

  it("disables comparison + shows the Ollama-only note for single-model backends", () => {
    setModels("llama_cpp");
    render(<QuantPage />);
    expect((screen.getByTestId("quant-run-evals") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("quant-run-toolcall") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("quant-compare-bench") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("quant-ollama-only")).toBeTruthy();
  });
});
