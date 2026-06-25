import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorldStateEditor } from "../env/WorldStateEditor";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const fsTask: ToolTask = {
  id: "es_fs_read",
  category: "agent_loop",
  prompt: "read",
  tools: [{ name: "read_file", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "no_call" },
  agentic: { mocks: [], end_state: { require_all: [{ tool: "read_file", args: {} }] }, environment: "filesystem", world_state: { "config.yaml": "timeout: 30\n" } },
};

describe("WorldStateEditor", () => {
  it("disables Save on malformed JSON and shows a parse error", () => {
    render(<WorldStateEditor task={fsTask} onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByTestId("world-state-textarea"), { target: { value: "{ not json" } });
    expect(screen.getByTestId("world-state-error")).toHaveTextContent(/Invalid JSON/);
    expect(screen.getByTestId("world-state-save")).toBeDisabled();
  });

  it("disables Save on a wrong per-env shape with the env-specific message", () => {
    render(<WorldStateEditor task={fsTask} onClose={() => {}} onSave={() => {}} />);
    // valid JSON, wrong shape for filesystem (a value is not a string)
    fireEvent.change(screen.getByTestId("world-state-textarea"), { target: { value: '{ "config.yaml": 123 }' } });
    expect(screen.getByTestId("world-state-error")).toHaveTextContent(/file path → file-content string/);
    expect(screen.getByTestId("world-state-save")).toBeDisabled();
  });

  it("enables Save on a valid edit and hands up the parsed snapshot", () => {
    const onSave = vi.fn();
    render(<WorldStateEditor task={fsTask} onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByTestId("world-state-textarea"), { target: { value: '{ "config.yaml": "timeout: 99\\n" }' } });
    expect(screen.queryByTestId("world-state-error")).toBeNull();
    const save = screen.getByTestId("world-state-save");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ "config.yaml": "timeout: 99\n" });
  });
});
