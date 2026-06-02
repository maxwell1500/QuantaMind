import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../shared/ipc/eval/evals", () => ({
  listEvals: vi.fn().mockResolvedValue([{ id: "a", category: "x", prompt: "p", scoring: {} }]),
  runEvalTask: vi.fn(),
}));

import { EvalPage } from "../components/EvalPage";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useEvalStore } from "../state/evalStore";

beforeEach(() => {
  useEvalStore.setState({ tasks: [], results: {}, running: false, currentId: null, error: null });
  useInstalledModelsStore.setState({
    list: [{
      name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "",
      parameter_size: "", quantization: "", backend: "ollama",
    }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
});

describe("EvalPage", () => {
  it("loads the bundled tasks and offers a model + Run", async () => {
    render(<EvalPage />);
    expect(await screen.findByTestId("eval-row-a")).toBeTruthy();
    expect(screen.getByTestId("eval-model-select")).toBeTruthy();
    expect(screen.getByTestId("eval-run")).toBeTruthy();
  });
});
