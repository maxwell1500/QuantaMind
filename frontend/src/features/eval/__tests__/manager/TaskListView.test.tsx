import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskListView } from "../../components/manager/TaskListView";
import { newDraft, type TaskDraft } from "../../evalDraft";

function drafts(): TaskDraft[] {
  return [{ ...newDraft(), id: "t1", prompt: "p" }];
}

const base = {
  results: {},
  dirty: false,
  modelSelected: true,
  running: false,
  onOpen: vi.fn(),
  onAddTask: vi.fn(),
  onSave: vi.fn(),
  onRunAll: vi.fn(),
};

describe("TaskListView", () => {
  it("renders a row per task and opens it on click", () => {
    const onOpen = vi.fn();
    const ds = drafts();
    render(<TaskListView {...base} drafts={ds} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("eval-task-row-t1"));
    expect(onOpen).toHaveBeenCalledWith(ds[0].key);
  });

  it("disables Run all when dirty, enables it when clean + model + tasks", () => {
    const { rerender } = render(<TaskListView {...base} drafts={drafts()} dirty />);
    expect(screen.getByTestId("eval-run-all")).toBeDisabled();
    rerender(<TaskListView {...base} drafts={drafts()} dirty={false} />);
    expect(screen.getByTestId("eval-run-all")).not.toBeDisabled();
  });

  it("Add Task fires from the empty state", () => {
    const onAddTask = vi.fn();
    render(<TaskListView {...base} drafts={[]} onAddTask={onAddTask} />);
    fireEvent.click(screen.getByTestId("eval-add-task-empty"));
    expect(onAddTask).toHaveBeenCalled();
  });
});
