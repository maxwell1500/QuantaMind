import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { invoke } from "@tauri-apps/api/core";
import { CompareToolbar } from "../components/CompareToolbar";
import { useCompareStore } from "../state/compareStore";
import { __resetCompareEventBusForTests } from "../state/compareEventBus";

const HW = (availGB: number) => ({
  total_memory_bytes: 32 * 1024 ** 3,
  available_memory_bytes: Math.round(availGB * 1024 ** 3),
  is_apple_silicon: true,
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  useCompareStore.getState().reset();
  __resetCompareEventBusForTests();
});

describe("CompareToolbar — wont_fit gate", () => {
  it("Run rejects with a friendly error when chosen strategy wouldn't fit", async () => {
    useCompareStore.setState({
      prompt: "ping",
      strategy: "parallel",
      hardwareSnapshot: HW(16),
      selectedModels: [
        { name: "a", size_bytes: 7 * 1024 ** 3 },
        { name: "b", size_bytes: 7 * 1024 ** 3 },
        { name: "c", size_bytes: 7 * 1024 ** 3 },
      ],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId("compare-start-error")).toHaveTextContent(/parallel/i);
    expect(screen.getByTestId("compare-start-error")).toHaveTextContent(/available/i);
  });

  it("Run proceeds normally when the strategy fits", async () => {
    useCompareStore.setState({
      prompt: "ping",
      strategy: "sequential",
      hardwareSnapshot: HW(16),
      selectedModels: [{ name: "a", size_bytes: 2 * 1024 ** 3 }],
    });
    render(<CompareToolbar />);
    await act(async () => { fireEvent.click(screen.getByTestId("compare-run")); });
    expect(invoke).toHaveBeenCalledWith("run_compare", expect.objectContaining({
      strategy: "sequential",
    }));
  });
});
