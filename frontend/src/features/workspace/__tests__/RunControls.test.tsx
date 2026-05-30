import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RunControls } from "../components/run/RunControls";

describe("RunControls", () => {
  it("Run is enabled when idle + canRun; Cancel is disabled", () => {
    const onRun = vi.fn();
    render(
      <RunControls
        status="idle"
        canRun={true}
        onRun={onRun}
        onCancel={() => {}}
      />,
    );
    const run = screen.getByRole("button", { name: /run/i });
    const cancel = screen.getByRole("button", { name: /cancel/i });
    expect(run).not.toBeDisabled();
    expect(cancel).toBeDisabled();
    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("Run is disabled while running; Cancel is enabled and fires onCancel", () => {
    const onCancel = vi.fn();
    render(
      <RunControls
        status="running"
        canRun={true}
        onRun={() => {}}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
    const cancel = screen.getByRole("button", { name: /cancel/i });
    expect(cancel).not.toBeDisabled();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Run is disabled when canRun is false (e.g., no model picked)", () => {
    render(
      <RunControls
        status="idle"
        canRun={false}
        onRun={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
  });

  it("shows the current status", () => {
    render(
      <RunControls
        status="done"
        canRun={true}
        onRun={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId("run-status")).toHaveTextContent("done");
  });

  it("Run is disabled when ollamaHealthy=false, with the 'Start Ollama first' title", () => {
    const onRun = vi.fn();
    render(
      <RunControls
        status="idle"
        canRun={true}
        ollamaHealthy={false}
        onRun={onRun}
        onCancel={() => {}}
      />,
    );
    const run = screen.getByRole("button", { name: /run/i });
    expect(run).toBeDisabled();
    expect(run).toHaveAttribute("title", "Start Ollama first");
    fireEvent.click(run);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("Run re-enables when ollamaHealthy flips back to true", () => {
    const { rerender } = render(
      <RunControls status="idle" canRun={true} ollamaHealthy={false}
        onRun={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
    rerender(
      <RunControls status="idle" canRun={true} ollamaHealthy={true}
        onRun={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /run/i })).not.toBeDisabled();
  });
});
