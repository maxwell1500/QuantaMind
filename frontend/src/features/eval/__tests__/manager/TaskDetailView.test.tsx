import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskDetailView } from "../../components/manager/TaskDetailView";
import { newDraft, type TaskDraft } from "../../evalDraft";
import type { ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";

function d(): TaskDraft {
  return { ...newDraft(), id: "t1", prompt: "p" };
}

const base = {
  index: 0,
  onChange: vi.fn(),
  onRemove: vi.fn(),
  onBack: vi.fn(),
  onRun: vi.fn(),
  result: undefined,
  running: false,
  modelSelected: true,
};

describe("TaskDetailView", () => {
  it("editing a field fires onChange", () => {
    const onChange = vi.fn();
    render(<TaskDetailView {...base} draft={d()} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue("p"), { target: { value: "new prompt" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("Run this task is disabled without a model and fires when enabled", () => {
    const onRun = vi.fn();
    const { rerender } = render(<TaskDetailView {...base} draft={d()} onRun={onRun} modelSelected={false} />);
    expect(screen.getByTestId("eval-run-task")).toBeDisabled();
    rerender(<TaskDetailView {...base} draft={d()} onRun={onRun} modelSelected />);
    fireEvent.click(screen.getByTestId("eval-run-task"));
    expect(onRun).toHaveBeenCalled();
  });

  it("shows the verdict checklist + metrics when a result is present", () => {
    const result: ToolTaskResult = {
      id: "t1",
      category: "single",
      verdict: { parsed: true, tool_match: true, args_match: false, abstain_correct: null },
    };
    render(<TaskDetailView {...base} draft={d()} result={result} />);
    expect(screen.getByTestId("eval-task-result")).toBeTruthy();
    expect(screen.getByTestId("eval-verdict-checklist")).toBeTruthy();
    expect(screen.getByTestId("eval-stats-bar")).toBeTruthy();
  });
});
