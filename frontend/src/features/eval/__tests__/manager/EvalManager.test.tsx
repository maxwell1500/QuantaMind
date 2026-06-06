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

import { EvalManager } from "../../components/manager/EvalManager";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
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

beforeEach(() => {
  vi.clearAllMocks();
  useBackendStore.setState({ selectedBackend: "ollama" });
  useInstalledModelsStore.setState({
    list: [{ name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_0", backend: "ollama" }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
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
  it("lists only the selected backend's models in the target dropdown", () => {
    useBackendStore.setState({ selectedBackend: "llama_cpp" });
    useInstalledModelsStore.setState({
      list: [
        { name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_0", backend: "ollama" },
        { name: "qwen.gguf", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_0", backend: "llama_cpp", path: "/w/qwen.gguf" },
      ],
      status: "ready", error: null, lastRefreshedAt: 1,
    });
    render(<EvalManager targets={[]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    fireEvent.click(screen.getByTestId("eval-model-dropdown"));
    expect(screen.getByTestId("eval-model-toggle-qwen.gguf")).toBeInTheDocument();
    expect(screen.queryByTestId("eval-model-toggle-llama3.2:1b")).toBeNull();
  });

  it("de-dupes Ollama tag duplicates (same digest) so a model isn't listed several times", () => {
    useBackendStore.setState({ selectedBackend: "ollama" });
    useInstalledModelsStore.setState({
      list: [
        // The same blob under two Ollama tags (identical digest) — e.g. gemma.
        { name: "gemma_q3_k_l:latest", digest: "3d3dcc", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q3_K_L", backend: "ollama" },
        { name: "gemma:q3_k_l", digest: "3d3dcc", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q3_K_L", backend: "ollama" },
        { name: "qwen3.5:9b", digest: "6488c9", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_K_M", backend: "ollama" },
      ],
      status: "ready", error: null, lastRefreshedAt: 1,
    });
    render(<EvalManager targets={[]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    fireEvent.click(screen.getByTestId("eval-model-dropdown"));
    // First occurrence of the shared digest wins; the duplicate tag is collapsed.
    expect(screen.getByTestId("eval-model-toggle-gemma_q3_k_l:latest")).toBeInTheDocument();
    expect(screen.queryByTestId("eval-model-toggle-gemma:q3_k_l")).toBeNull();
    expect(screen.getByTestId("eval-model-toggle-qwen3.5:9b")).toBeInTheDocument();
  });

  it("nudges to enable native tool-calling while it's off, and hides the nudge once enabled", () => {
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    // Prompt-based is the default → the honesty hint is shown.
    expect(screen.getByTestId("native-fc-hint")).toHaveTextContent(/underrepresent native tool-calling/i);
    // Enabling native FC means they've opted into strict fidelity → hint goes away.
    fireEvent.click(screen.getByTestId("eval-native-fc"));
    expect(screen.queryByTestId("native-fc-hint")).toBeNull();
  });

  it("renders the headers and Data Source radio controls", () => {
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    expect(screen.getByText("1. EVAL MANAGER")).toBeInTheDocument();
    expect(screen.getByText("(File & Controls)")).toBeInTheDocument();
    expect(screen.getByText("◉ Built-in")).toBeInTheDocument();
    expect(screen.getByText("◯ Custom JSON")).toBeInTheDocument();
  });

  it("renders presets under collections when Built-in is selected", () => {
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    expect(screen.getByTestId("eval-collection-item-curated")).toBeInTheDocument();
  });

  it("switches to Custom JSON and lists custom collections", async () => {
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    
    // Switch to Custom JSON
    const customRadioLabel = screen.getByText("◯ Custom JSON");
    fireEvent.click(customRadioLabel);
    
    await waitFor(() => {
      expect(select).toHaveBeenCalledWith("my-evals");
    });
  });

  it("confirms before deleting a custom collection", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    useEvalRegistryStore.setState({
      presets: [{ id: "curated", label: "Curated Suite" }],
      collections: ["my-evals"],
      selected: "my-evals", // custom selection → the custom list (with ✕) renders
      tasks: sampleTasks,
      init,
      select,
      importFile,
      remove,
    });
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);

    // Open the ⋯ menu, then choose Delete → a confirm popup appears.
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
    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);

    fireEvent.click(screen.getByTestId("eval-collection-menu-agentic_3"));
    fireEvent.click(screen.getByTestId("eval-collection-delete-agentic_3"));
    fireEvent.click(screen.getByTestId("confirm-ok"));
    await waitFor(() => expect(hidePreset).toHaveBeenCalledWith("agentic_3"));
  });

  it("triggers runBatchEval when ▶ RUN BATCH is clicked", async () => {
    useParamsStore.setState({ globalParams: { temperature: 0.2 } });
    vi.mocked(runBatchEval).mockResolvedValue({
      collection_id: "curated",
      columns: [],
    });

    render(<EvalManager targets={["llama3.2:1b"]} setTargets={() => {}} k={1} setK={() => {}} maxSteps={8} setMaxSteps={() => {}} />);
    
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
        false, // runNativeFc — the "Measure native tool-calling" checkbox (Phase 7.2), off by default
      );
    });
  });
});
