import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunStrategyPicker } from "../components/controls/RunStrategyPicker";
import { useCompareStore } from "../state/compareStore";
import { useSelectedModelStore, type SelectedModel } from "../../../shared/state/selectedModelStore";

const HW = (availGB: number, totalGB = 32) => ({
  total_memory_bytes: Math.round(totalGB * 1024 ** 3),
  available_memory_bytes: Math.round(availGB * 1024 ** 3),
  is_apple_silicon: true,
});
const sel = (name: string, gb: number): SelectedModel => ({ name, backend: "ollama", size_bytes: gb * 1024 ** 3 });

beforeEach(() => {
  useCompareStore.getState().reset();
  useSelectedModelStore.setState({ selectedModels: [] });
});

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
    useSelectedModelStore.setState({ selectedModels: [sel("a", 7), sel("b", 7), sel("c", 7)] });
    useCompareStore.setState({ hardwareSnapshot: HW(16) });
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
