import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskSandboxConfigurator } from "../components/manager/TaskSandboxConfigurator";
import { newDraft } from "../evalDraft";

describe("TaskSandboxConfigurator", () => {
  it("shows single-turn fields by default and swaps to the sandbox boxes on Multi-Step", () => {
    const onChange = vi.fn();
    const draft = { ...newDraft(), key: "k1", id: "t1", category: "single" as const };
    const { rerender } = render(<TaskSandboxConfigurator draft={draft} onChange={onChange} onRemove={() => {}} onBack={() => {}} />);

    // Single-turn → Expected Output, no sandbox/end-state boxes.
    expect(screen.getByTestId("configurator-expected")).toBeInTheDocument();
    expect(screen.queryByTestId("configurator-mocks")).toBeNull();

    // Clicking Multi-Step asks the parent to set category "agentic".
    fireEvent.click(screen.getByTestId("type-agentic"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: "agentic" }));

    // Rendered as agentic → the Deterministic Sandbox + End-State boxes appear.
    rerender(<TaskSandboxConfigurator draft={{ ...draft, category: "agentic" }} onChange={onChange} onRemove={() => {}} onBack={() => {}} />);
    expect(screen.getByTestId("configurator-mocks")).toBeInTheDocument();
    expect(screen.getByTestId("configurator-endstate")).toBeInTheDocument();
    expect(screen.queryByTestId("configurator-expected")).toBeNull();
  });

  it("edits the system prompt through onChange", () => {
    const onChange = vi.fn();
    const draft = { ...newDraft(), key: "k1", id: "t1" };
    render(<TaskSandboxConfigurator draft={draft} onChange={onChange} onRemove={() => {}} onBack={() => {}} />);
    fireEvent.change(screen.getByTestId("configurator-prompt"), { target: { value: "be safe" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ prompt: "be safe" }));
  });
});
