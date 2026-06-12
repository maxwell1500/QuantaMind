import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../../../shared/ipc/eval/batch", () => ({
  runBatchEval: vi.fn(),
  stopBatchEval: vi.fn(),
  EVENT_BATCH_PROGRESS: "batch-progress",
  EVENT_AGENTIC_STEP: "agentic-step",
  EVENT_BATCH_COMPLETE: "batch-complete",
}));
// The batch run pre-flights the backend's health; treat it as up here so the run
// proceeds (the pre-flight itself is tested in useBatchRun.test).
vi.mock("../../../../shared/ipc/core/client", () => ({
  healthFor: vi.fn().mockResolvedValue({ available: true, version: null }),
}));

import { EvalManager } from "../../components/manager/EvalManager";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { runBatchEval } from "../../../../shared/ipc/eval/batch";
import { useParamsStore } from "../../../../shared/state/paramsStore";
import { useBackendStore } from "../../../../shared/state/backendStore";

const sampleTasks = [{
  id: "w",
  category: "single",
  prompt: "Weather in Paris?",
  tools: [{ name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }],
  expected: { type: "call", name: "get_weather", args: { city: "Paris" } },
}] as never;

const init = vi.fn().mockResolvedValue(undefined);
const select = vi.fn().mockResolvedValue(undefined);
const importFile = vi.fn().mockResolvedValue(undefined);

// Default props shorthand: the eval model + collection config (the model comes from
// the GLOBAL selection store; the prop is the chosen one).
const props = (over: Record<string, unknown> = {}) => ({
  model: "llama3.2:1b",
  setModel: () => {},
  k: 1,
  setK: () => {},
  maxSteps: 8,
  setMaxSteps: () => {},
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  useBackendStore.setState({ selectedBackend: "ollama" });
  useInstalledModelsStore.setState({
    list: [{ name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_0", backend: "ollama" }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
  // The eval model dropdown is driven by the GLOBAL selection (not a per-page list).
  useSelectedModelStore.setState({ selectedModels: [{ name: "llama3.2:1b", backend: "ollama", size_bytes: 1 }] });
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: ["my-evals"],
    selected: "curated",
    tasks: sampleTasks,
    init,
    select,
    importFile,
  });
});

describe("EvalManager Sidebar Controls", () => {
  it("lists the GLOBAL selection in the Model dropdown (single source of truth)", () => {
    useSelectedModelStore.setState({
      selectedModels: [
        { name: "qwen3.5:9b", backend: "ollama", size_bytes: 1 },
        { name: "llama3.2:1b", backend: "ollama", size_bytes: 1 },
      ],
    });
    render(<EvalManager {...props({ model: "qwen3.5:9b" })} />);
    const dropdown = screen.getByTestId("eval-model-dropdown");
    expect(dropdown).toHaveTextContent("qwen3.5:9b");
    expect(dropdown).toHaveTextContent("llama3.2:1b");
  });

  it("prompts to pick a model at the top when nothing is selected globally", () => {
    useSelectedModelStore.setState({ selectedModels: [] });
    render(<EvalManager {...props({ model: "" })} />);
    expect(screen.getByTestId("eval-no-model")).toHaveTextContent("Select a model at the top");
    expect(screen.queryByTestId("eval-model-dropdown")).toBeNull();
    expect(screen.getByTestId("eval-run-all")).toHaveAttribute("title", "Select a model at the top");
  });

  it("offers an ⓘ next to Iterations (k) explaining Pass^k", () => {
    render(<EvalManager {...props()} />);
    const info = screen.getByTestId("info-iterations");
    fireEvent.mouseEnter(info.parentElement as HTMLElement);
    expect(screen.getByTestId("info-popup-iterations")).toHaveTextContent(/Pass\^k/);
  });

  it("explains WHY the RUN BATCH button is disabled (no model vs no tasks)", () => {
    useSelectedModelStore.setState({ selectedModels: [] });
    const { rerender } = render(<EvalManager {...props({ model: "" })} />);
    expect(screen.getByTestId("eval-run-all")).toHaveAttribute("title", "Select a model at the top");
    // Model present but the collection has no tasks → the button says no tasks.
    useSelectedModelStore.setState({ selectedModels: [{ name: "llama3.2:1b", backend: "ollama", size_bytes: 1 }] });
    useEvalRegistryStore.setState({ tasks: [] });
    rerender(<EvalManager {...props()} />);
    expect(screen.getByTestId("eval-run-all")).toHaveAttribute("title", "This collection has no tasks");
  });

  it("nudges to enable native tool-calling while it's off, and hides the nudge once enabled", () => {
    render(<EvalManager {...props()} />);
    expect(screen.getByTestId("native-fc-hint")).toHaveTextContent(/underrepresent native tool-calling/i);
    fireEvent.click(screen.getByTestId("eval-native-fc"));
    expect(screen.queryByTestId("native-fc-hint")).toBeNull();
  });

  it("renders the headers and Data Source radio controls", () => {
    render(<EvalManager {...props()} />);
    expect(screen.getByText("1. EVAL MANAGER")).toBeInTheDocument();
    expect(screen.getByText("(File & Controls)")).toBeInTheDocument();
    expect(screen.getByText("◉ Built-in")).toBeInTheDocument();
    expect(screen.getByText("◯ Custom JSON")).toBeInTheDocument();
  });

  it("renders presets under collections when Built-in is selected", () => {
    render(<EvalManager {...props()} />);
    expect(screen.getByTestId("eval-collection-item-curated")).toBeInTheDocument();
  });

  it("switches to Custom JSON and lists custom collections", async () => {
    render(<EvalManager {...props()} />);
    fireEvent.click(screen.getByText("◯ Custom JSON"));
    await waitFor(() => expect(select).toHaveBeenCalledWith("my-evals"));
  });

  it("confirms before deleting a custom collection", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    useEvalRegistryStore.setState({
      presets: [{ id: "curated", label: "Curated Suite" }],
      collections: ["my-evals"],
      selected: "my-evals",
      tasks: sampleTasks,
      init,
      select,
      importFile,
      remove,
    });
    render(<EvalManager {...props()} />);
    fireEvent.click(screen.getByTestId("eval-collection-menu-my-evals"));
    fireEvent.click(screen.getByTestId("eval-collection-delete-my-evals"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("my-evals"));
  });

  it("removes a built-in preset from the list via its ⋯ menu", async () => {
    const hidePreset = vi.fn();
    useEvalRegistryStore.setState({
      presets: [{ id: "agentic_3", label: "Agentic · 3 Multi-Step" }],
      collections: [],
      selected: "agentic_3",
      tasks: sampleTasks,
      init,
      select,
      importFile,
      hidePreset,
    });
    render(<EvalManager {...props()} />);
    fireEvent.click(screen.getByTestId("eval-collection-menu-agentic_3"));
    fireEvent.click(screen.getByTestId("eval-collection-delete-agentic_3"));
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(hidePreset).toHaveBeenCalledWith("agentic_3"));
  });

  it("runs the chosen global model when ▶ RUN BATCH is clicked", async () => {
    useParamsStore.setState({ globalParams: { temperature: 0.2 } });
    vi.mocked(runBatchEval).mockResolvedValue({ collection_id: "curated", columns: [] });
    render(<EvalManager {...props()} />);
    const runBtn = screen.getByTestId("eval-run-all");
    expect(runBtn).not.toBeDisabled();
    fireEvent.click(runBtn);
    await waitFor(() => {
      expect(runBatchEval).toHaveBeenCalledWith(
        "curated",
        [{ model: "llama3.2:1b", backend: "ollama" }],
        sampleTasks,
        1,
        8,
        { temperature: 0.2 },
        undefined,
        false, // runNativeFc — off by default
      );
    });
  });
});
