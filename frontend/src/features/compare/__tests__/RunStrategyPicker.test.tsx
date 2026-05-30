import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunStrategyPicker } from "../components/RunStrategyPicker";
import { useCompareStore } from "../state/compareStore";

const HW = (availGB: number, totalGB = 32) => ({
  total_memory_bytes: Math.round(totalGB * 1024 ** 3),
  available_memory_bytes: Math.round(availGB * 1024 ** 3),
  is_apple_silicon: true,
});

beforeEach(() => useCompareStore.getState().reset());

describe("RunStrategyPicker", () => {
  it("renders the strategy radio cards with sequential active by default", () => {
    render(<RunStrategyPicker />);
    expect(screen.getByTestId("strategy-sequential")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("strategy-parallel")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("strategy-sequential_skippable")).toBeNull();
  });

  it("clicking a card updates compareStore.strategy", () => {
    render(<RunStrategyPicker />);
    fireEvent.click(screen.getByTestId("strategy-parallel"));
    expect(useCompareStore.getState().strategy).toBe("parallel");
    expect(screen.getByTestId("strategy-parallel")).toHaveAttribute("aria-checked", "true");
  });

  it("verdict pills appear once models + snapshot are populated", () => {
    useCompareStore.setState({
      selectedModels: [
        { name: "a", size_bytes: 7 * 1024 ** 3 },
        { name: "b", size_bytes: 7 * 1024 ** 3 },
        { name: "c", size_bytes: 7 * 1024 ** 3 },
      ],
      hardwareSnapshot: HW(16),
    });
    render(<RunStrategyPicker />);
    // sum 3×7×1.3 = 27.3GB → wont fit in 16
    expect(screen.getByTestId("strategy-verdict-parallel")).toHaveTextContent(/Won't fit/);
    // max 7×1.3 = 9.1GB; 9.1/16 = 0.57 → OK
    expect(screen.getByTestId("strategy-verdict-sequential")).toHaveTextContent(/OK/);
  });

  it("does not render verdict pills when no models are selected", () => {
    useCompareStore.setState({ hardwareSnapshot: HW(16) });
    render(<RunStrategyPicker />);
    expect(screen.queryByTestId("strategy-verdict-sequential")).toBeNull();
  });
});
