import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
// The scoreboard + debugger have their own suites; stub them so this stays a
// page-composition check (3 panes mount + registry initialises).
vi.mock("../components/scoreboard/MatrixScoreboard", () => ({ MatrixScoreboard: () => <div data-testid="matrix-scoreboard" /> }));
vi.mock("../components/TraceDebugger", () => ({ TraceDebugger: () => <div data-testid="trace-debugger" /> }));

import { EvalPage } from "../components/EvalPage";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useBatchStore } from "../state/batchStore";

const init = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  useBatchStore.getState().reset();
  useEvalRegistryStore.setState({
    presets: [{ id: "curated", label: "Curated Suite" }],
    collections: [],
    selected: "curated",
    tasks: [],
    init,
  });
  useInstalledModelsStore.setState({
    list: [{ name: "llama3.2:1b", size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "", backend: "ollama" }],
    status: "ready",
    error: null,
    lastRefreshedAt: 1,
  });
});

describe("EvalPage (3-pane workspace)", () => {
  it("mounts the Manager, Matrix Scoreboard and Trace Debugger, and inits the registry", async () => {
    render(<EvalPage />);
    expect(await screen.findByTestId("eval-manager")).toBeTruthy();
    expect(screen.getByTestId("matrix-scoreboard")).toBeTruthy();
    expect(screen.getByTestId("trace-debugger")).toBeTruthy();
    expect(init).toHaveBeenCalled();
  });

  it("disables the audit export until a batch report exists", () => {
    render(<EvalPage />);
    expect(screen.getByTestId("export-csv")).toBeDisabled();
    expect(screen.getByTestId("export-json")).toBeDisabled();
  });
});
