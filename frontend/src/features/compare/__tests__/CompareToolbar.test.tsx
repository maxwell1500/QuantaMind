import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { invoke } from "@tauri-apps/api/core";
import { CompareToolbar } from "../components/CompareToolbar";
import { useCompareStore } from "../state/compareStore";
import { __resetCompareEventBusForTests } from "../state/compareEventBus";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "run_compare") return Promise.resolve(undefined);
    if (cmd === "stop_compare") return Promise.resolve(undefined);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  useCompareStore.getState().reset();
  __resetCompareEventBusForTests();
});

describe("CompareToolbar", () => {
  it("Run is disabled when no models are selected", () => {
    useCompareStore.setState({ prompt: "go", selectedModels: [] });
    render(<CompareToolbar />);
    expect(screen.getByTestId("compare-run")).toBeDisabled();
  });

  it("Run is disabled when prompt is empty", () => {
    useCompareStore.setState({ prompt: "  ", selectedModels: [{ name: "a", size_bytes: 1 }] });
    render(<CompareToolbar />);
    expect(screen.getByTestId("compare-run")).toBeDisabled();
  });

  it("clicking Run invokes run_compare with sequential strategy and seeds rows", async () => {
    useCompareStore.setState({
      prompt: "ping",
      selectedModels: [{ name: "a", size_bytes: 1 }, { name: "b", size_bytes: 1 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("run_compare", {
      models: ["a", "b"], prompt: "ping", strategy: "sequential",
    }));
    expect(useCompareStore.getState().rows.map((r) => r.model)).toEqual(["a", "b"]);
  });

  it("when systemPrompt is set, run_compare receives the system field", async () => {
    useCompareStore.setState({
      prompt: "ping",
      systemPrompt: "You are terse.",
      selectedModels: [{ name: "a", size_bytes: 1 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("run_compare", {
      models: ["a"], prompt: "ping", strategy: "sequential", system: "You are terse.",
    }));
  });

  it("when systemPrompt is empty/whitespace, run_compare omits the system field", async () => {
    useCompareStore.setState({
      prompt: "ping",
      systemPrompt: "   ",
      selectedModels: [{ name: "a", size_bytes: 1 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("run_compare", {
      models: ["a"], prompt: "ping", strategy: "sequential",
    }));
  });

  it("after start the Cancel-all button appears and invokes stop_compare", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "run_compare") return new Promise(() => {}); // never resolves
      if (cmd === "stop_compare") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unknown ${cmd}`));
    });
    useCompareStore.setState({
      prompt: "ping",
      selectedModels: [{ name: "a", size_bytes: 1 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    await screen.findByTestId("compare-cancel-all");
    fireEvent.click(screen.getByTestId("compare-cancel-all"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("stop_compare", { modelId: null }));
  });

  it("if run_compare rejects the start error surfaces and isRunning resets", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "run_compare") return Promise.reject({ kind: "validation", message: "no good" });
      return Promise.resolve(undefined);
    });
    useCompareStore.setState({
      prompt: "ping",
      selectedModels: [{ name: "a", size_bytes: 1 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    expect(await screen.findByTestId("compare-start-error")).toHaveTextContent(/no good/);
    expect(useCompareStore.getState().isRunning).toBe(false);
  });
});
