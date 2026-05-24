import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { invoke } from "@tauri-apps/api/core";
import { CompareColumn } from "../components/CompareColumn";
import { useCompareStore, type CompareRow } from "../state/compareStore";
import { __resetCompareEventBusForTests } from "../state/compareEventBus";

const ROW = (over: Partial<CompareRow> = {}): CompareRow => ({
  model: "llama3.2:1b", modelId: "uuid-1", status: "running", output: "hi",
  metrics: null, error: null, startedAt: null, endedAt: null,
  ...over,
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  useCompareStore.getState().reset();
  __resetCompareEventBusForTests();
});

describe("CompareColumn — Skip button", () => {
  it("does not render when strategy is sequential", () => {
    useCompareStore.setState({ strategy: "sequential" });
    render(<CompareColumn row={ROW()} />);
    expect(screen.queryByTestId("compare-skip-llama3.2:1b")).toBeNull();
  });

  it("does not render when row is not running", () => {
    useCompareStore.setState({ strategy: "sequential_skippable" });
    render(<CompareColumn row={ROW({ status: "pending" })} />);
    expect(screen.queryByTestId("compare-skip-llama3.2:1b")).toBeNull();
  });

  it("renders when strategy=sequential_skippable AND row is running", () => {
    useCompareStore.setState({ strategy: "sequential_skippable" });
    render(<CompareColumn row={ROW()} />);
    expect(screen.getByTestId("compare-skip-llama3.2:1b")).toBeInTheDocument();
  });

  it("clicking Skip invokes stop_compare with the row's modelId", async () => {
    useCompareStore.setState({ strategy: "sequential_skippable" });
    render(<CompareColumn row={ROW()} />);
    fireEvent.click(screen.getByTestId("compare-skip-llama3.2:1b"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("stop_compare", { modelId: "uuid-1" }));
  });

  it("does not render when modelId is null (row hasn't received first token yet)", () => {
    useCompareStore.setState({ strategy: "sequential_skippable" });
    render(<CompareColumn row={ROW({ modelId: null })} />);
    expect(screen.queryByTestId("compare-skip-llama3.2:1b")).toBeNull();
  });
});
