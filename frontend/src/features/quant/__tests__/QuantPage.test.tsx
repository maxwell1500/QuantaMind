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

const GB = 1024 ** 3;
const variant = (q: string, gb: number) => ({
  name: `llama-7b-${q}`, size_bytes: gb * GB, modified_at: "",
  family: "Llama", parameter_size: "7B", quantization: q, backend: "llama_cpp" as const,
});

beforeEach(() => {
  vi.clearAllMocks();
  useInstalledModelsStore.setState({
    list: [variant("Q4_K_M", 4), variant("Q8_0", 8)],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
});

describe("QuantPage", () => {
  it("lists the model's quant variants and a recommendation", () => {
    render(<QuantPage />);
    expect(screen.getByTestId("quant-variant-Q4_K_M")).toBeTruthy();
    expect(screen.getByTestId("quant-variant-Q8_0")).toBeTruthy();
    expect(screen.getByTestId("quant-recommendation")).toBeTruthy();
  });

  it("runs the eval suite per variant and fills the quality column", async () => {
    render(<QuantPage />);
    fireEvent.click(screen.getByTestId("quant-run-evals"));
    await waitFor(() => expect(screen.getByTestId("quant-quality-Q4_K_M")).toHaveTextContent("2/2"));
    expect(screen.getByTestId("quant-quality-Q8_0")).toHaveTextContent("2/2");
  });
});
