import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../../../shared/ipc/eval/toolcall", () => ({ runToolcallEval: vi.fn() }));

import { EvalManager } from "../../components/manager/EvalManager";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { runToolcallEval } from "../../../../shared/ipc/eval/toolcall";

const sampleTasks = [{
  id: "w",
  category: "single",
  prompt: "Weather in Paris?",
  tools: [{ name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } }],
  expected: { type: "call", name: "get_weather", args: { city: "Paris" } },
}] as never;

const init = vi.fn().mockResolvedValue(undefined);
const save = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  useInstalledModelsStore.setState({
    list: [{ name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "", backend: "ollama" }],
    status: "ready", error: null, lastRefreshedAt: 1,
  });
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: ["my-evals"],
    selected: "my-evals",
    tasks: sampleTasks,
    init,
    save,
  });
});

function selectModel() {
  fireEvent.change(screen.getByTestId("eval-manager-model-select"), { target: { value: "llama3.2:1b" } });
}

describe("EvalManager (master-detail)", () => {
  it("New Collection → name modal → empty editable list", () => {
    render(<EvalManager />);
    fireEvent.click(screen.getByTestId("eval-manager-new"));
    expect(screen.getByTestId("eval-name-dialog")).toBeTruthy();
    fireEvent.change(screen.getByTestId("eval-name-input"), { target: { value: "my-suite" } });
    fireEvent.click(screen.getByTestId("eval-name-create"));
    expect(screen.queryByTestId("eval-name-dialog")).toBeNull();
    expect(screen.getByTestId("eval-manager-name")).toHaveValue("my-suite");
    expect(screen.queryByTestId("eval-task-row-w")).toBeNull(); // fresh, empty
    expect(screen.getByTestId("eval-add-task")).toBeTruthy();
  });

  it("Add Task opens the task detail editor", () => {
    render(<EvalManager />);
    fireEvent.click(screen.getByTestId("eval-add-task"));
    expect(screen.getByTestId("eval-task-detail")).toBeTruthy();
  });

  it("opening a task row shows its detail", () => {
    render(<EvalManager />);
    fireEvent.click(screen.getByTestId("eval-task-row-w"));
    expect(screen.getByTestId("eval-task-detail")).toBeTruthy();
  });

  it("Save blocks an incomplete task with a friendly message (no raw Zod)", () => {
    render(<EvalManager />);
    fireEvent.click(screen.getByTestId("eval-task-row-w"));
    fireEvent.change(screen.getByDisplayValue("Weather in Paris?"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("eval-task-back"));
    fireEvent.click(screen.getByTestId("eval-save"));
    const status = screen.getByTestId("eval-manager-status");
    expect(status).toHaveTextContent("Fix validation errors");
    expect(status.textContent).not.toContain("[");
    expect(save).not.toHaveBeenCalled();
  });

  it("Run all is gated until edits are saved", () => {
    render(<EvalManager />);
    selectModel();
    expect(screen.getByTestId("eval-run-all")).not.toBeDisabled();
    // edit a task → dirty → Run all disabled
    fireEvent.click(screen.getByTestId("eval-task-row-w"));
    fireEvent.change(screen.getByDisplayValue("Weather in Paris?"), { target: { value: "changed" } });
    fireEvent.click(screen.getByTestId("eval-task-back"));
    expect(screen.getByTestId("eval-run-all")).toBeDisabled();
  });

  it("Run this task runs the single live task and shows its result", async () => {
    vi.mocked(runToolcallEval).mockResolvedValue({
      n: 1, parse_rate: 1, tool_selection_acc: 1, arg_acc: 1, abstain_acc: null, composite: 1, prompt_tokens: null,
      per_task: [{ id: "w", category: "single", verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null } }],
    });
    render(<EvalManager />);
    selectModel();
    fireEvent.click(screen.getByTestId("eval-task-row-w"));
    fireEvent.click(screen.getByTestId("eval-run-task"));
    await waitFor(() => expect(runToolcallEval).toHaveBeenCalledOnce());
    const [, , tasks] = vi.mocked(runToolcallEval).mock.calls[0];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("w");
    await waitFor(() => expect(screen.getByTestId("eval-task-result")).toBeTruthy());
  });
});
