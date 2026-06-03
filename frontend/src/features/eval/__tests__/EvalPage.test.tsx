import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// The two probe panels have their own suites; stub them so this test stays a
// page-composition check (manager mounts + registry initialises).
vi.mock("../components/matrix/MatrixPanel", () => ({ MatrixPanel: () => <div data-testid="matrix-panel" /> }));
vi.mock("../components/pipeline/PipelinePanel", () => ({ PipelinePanel: () => <div data-testid="pipeline-panel" /> }));
vi.mock("../components/ToolCallPanel", () => ({ ToolCallPanel: () => <div data-testid="toolcall-panel" /> }));
vi.mock("../components/ContextCliffPanel", () => ({ ContextCliffPanel: () => <div data-testid="cliff-panel" /> }));

import { EvalPage } from "../components/EvalPage";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

const init = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: [],
    selected: "curated",
    tasks: [],
    init,
  });
  useInstalledModelsStore.setState({
    list: [{
      name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "",
      parameter_size: "", quantization: "", backend: "ollama",
    }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
});

describe("EvalPage", () => {
  it("renders the Eval Manager and initialises the registry", async () => {
    render(<EvalPage />);
    expect(await screen.findByTestId("eval-manager")).toBeTruthy();
    expect(screen.getByTestId("eval-manager-model-select")).toBeTruthy();
    expect(screen.getByTestId("toolcall-panel")).toBeTruthy();
    expect(init).toHaveBeenCalled();
  });

  it("toggles the Eval Runner between Scoreboard and Debugger", () => {
    render(<EvalPage />);
    expect(screen.getByTestId("runner-tab-scoreboard")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("runner-tab-debugger")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByTestId("runner-tab-debugger"));
    expect(screen.getByTestId("runner-tab-debugger")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("runner-tab-scoreboard")).toHaveAttribute("aria-pressed", "false");
  });
});
