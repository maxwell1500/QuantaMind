import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import { RunButton } from "../run/RunButton";
import { useRunController } from "../../state/runController";

beforeEach(() => useRunController.getState().clear());

describe("RunButton (header Play/Stop)", () => {
  it("Play is disabled until a run is possible", () => {
    render(<RunButton />);
    expect(screen.getByTestId("run-play")).toBeDisabled();
  });

  it("Play runs when canRun, via the registered handler", () => {
    const run = vi.fn();
    act(() => useRunController.getState().register({ running: false, canRun: true, run, stop: () => {} }));
    render(<RunButton />);
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("while running it shows Stop and cancels", () => {
    const stop = vi.fn();
    act(() => useRunController.getState().register({ running: true, canRun: true, run: () => {}, stop }));
    render(<RunButton />);
    expect(screen.queryByTestId("run-play")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
