import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { HardwareSummary } from "../components/HardwareSummary";
import { useCompareStore } from "../state/compareStore";

const HW = (availableGB: number, totalGB = 32, apple = true) => ({
  total_memory_bytes: Math.round(totalGB * 1024 ** 3),
  available_memory_bytes: Math.round(availableGB * 1024 ** 3),
  is_apple_silicon: apple,
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useCompareStore.getState().reset();
});

describe("HardwareSummary", () => {
  it("renders total/available memory and labels Apple Silicon as 'Unified memory'", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(16));
    render(<HardwareSummary />);
    const out = await screen.findByTestId("hw-summary");
    expect(out).toHaveTextContent(/Unified memory/);
    expect(out).toHaveTextContent(/32\.0GB total/);
    expect(out).toHaveTextContent(/16\.0GB available/);
  });

  it("renders 'RAM' label on non-Apple-Silicon hardware", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(16, 32, false));
    render(<HardwareSummary />);
    expect(await screen.findByTestId("hw-summary")).toHaveTextContent(/^RAM:/);
  });

  it("renders per-strategy verdict pills only when 2+ models are selected", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(16));
    useCompareStore.setState({
      selectedModels: [
        { name: "x", size_bytes: 2 * 1024 ** 3 },
        { name: "y", size_bytes: 2 * 1024 ** 3 },
      ],
    });
    render(<HardwareSummary />);
    await screen.findByTestId("verdict-sequential");
    expect(screen.getByTestId("verdict-sequential")).toHaveTextContent(/Sequential: OK/);
    expect(screen.getByTestId("verdict-parallel")).toHaveTextContent(/Parallel: OK/);
  });

  it("a single fitting model shows no strategy pills or warning", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(16));
    useCompareStore.setState({ selectedModels: [{ name: "x", size_bytes: 2 * 1024 ** 3 }] });
    render(<HardwareSummary />);
    await screen.findByTestId("hw-summary");
    expect(screen.queryByTestId("verdict-sequential")).toBeNull();
    expect(screen.queryByTestId("hw-single-warning")).toBeNull();
  });

  it("a single tight model shows one warning, not strategy pills", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(3.4));
    useCompareStore.setState({ selectedModels: [{ name: "big", size_bytes: 3 * 1024 ** 3 }] });
    render(<HardwareSummary />);
    expect(await screen.findByTestId("hw-single-warning")).toBeTruthy();
    expect(screen.queryByTestId("verdict-sequential")).toBeNull();
  });

  it("marks Parallel 'Won't fit' when summed required > available", async () => {
    vi.mocked(invoke).mockResolvedValue(HW(16));
    useCompareStore.setState({
      selectedModels: [
        { name: "a", size_bytes: 7 * 1024 ** 3 },
        { name: "b", size_bytes: 7 * 1024 ** 3 },
        { name: "c", size_bytes: 7 * 1024 ** 3 },
      ],
    });
    render(<HardwareSummary />);
    expect(await screen.findByTestId("verdict-parallel")).toHaveTextContent(/Won't fit/);
  });

  it("surfaces an error and a Retry that refetches", async () => {
    let calls = 0;
    vi.mocked(invoke).mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject({ kind: "internal", message: "boom" })
        : Promise.resolve(HW(16));
    });
    render(<HardwareSummary />);
    await screen.findByTestId("hw-summary-error");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.queryByTestId("hw-summary-error")).toBeNull());
    expect(screen.getByTestId("hw-summary")).toBeInTheDocument();
  });
});
