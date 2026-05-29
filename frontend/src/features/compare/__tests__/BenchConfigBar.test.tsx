import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { BenchConfigBar } from "../components/config/BenchConfigBar";
import { useCompareStore } from "../state/compareStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue([]);
  useCompareStore.getState().reset();
});

describe("BenchConfigBar", () => {
  it("Save is disabled until a name is entered", async () => {
    render(<BenchConfigBar />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_bench_configs"));
    expect(screen.getByTestId("bench-config-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("bench-config-name"), { target: { value: "smoke" } });
    expect(screen.getByTestId("bench-config-save")).toBeEnabled();
  });

  it("Save sends the current store state as a BenchConfig", async () => {
    useCompareStore.setState({
      selectedModels: [{ name: "llama3:1b", size_bytes: 100 }],
      strategy: "parallel", systemPrompt: "sys", prompt: "hi",
    });
    vi.mocked(invoke).mockImplementation((cmd: string) =>
      cmd === "list_bench_configs" ? Promise.resolve([]) : Promise.resolve({
        name: "smoke", models: [], strategy: "parallel", system: "sys", user: "hi",
        created_at: "t", updated_at: "t",
      }));
    render(<BenchConfigBar />);
    fireEvent.change(screen.getByTestId("bench-config-name"), { target: { value: "smoke" } });
    await act(async () => { fireEvent.click(screen.getByTestId("bench-config-save")); });
    const call = vi.mocked(invoke).mock.calls.find(([c]) => c === "save_bench_config");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({
      name: "smoke",
      config: { strategy: "parallel", system: "sys", user: "hi", models: [{ name: "llama3:1b", size_bytes: 100 }] },
    });
  });

  it("Load populates the store from the chosen config", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_bench_configs") return Promise.resolve([{ name: "smoke", path: "/w/smoke.bench.yaml" }]);
      if (cmd === "load_bench_config") return Promise.resolve({
        name: "smoke", models: [{ name: "qwen:0.5b", size_bytes: 42 }],
        strategy: "parallel", system: "sys-x", user: "hello", created_at: "t", updated_at: "t",
      });
      return Promise.resolve([]);
    });
    render(<BenchConfigBar />);
    await waitFor(() => expect(screen.getByText("smoke")).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId("bench-config-load"), { target: { value: "/w/smoke.bench.yaml" } });
    });
    await waitFor(() => expect(useCompareStore.getState().prompt).toBe("hello"));
    const s = useCompareStore.getState();
    expect(s.systemPrompt).toBe("sys-x");
    expect(s.strategy).toBe("parallel");
    expect(s.selectedModels).toEqual([{ name: "qwen:0.5b", size_bytes: 42 }]);
  });

  it("surfaces an error when saving without an open workspace", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_bench_configs") return Promise.resolve([]);
      return Promise.reject({ kind: "validation", message: "no workspace open" });
    });
    render(<BenchConfigBar />);
    fireEvent.change(screen.getByTestId("bench-config-name"), { target: { value: "smoke" } });
    await act(async () => { fireEvent.click(screen.getByTestId("bench-config-save")); });
    expect(await screen.findByTestId("bench-config-error")).toHaveTextContent(/no workspace open/);
  });
});
