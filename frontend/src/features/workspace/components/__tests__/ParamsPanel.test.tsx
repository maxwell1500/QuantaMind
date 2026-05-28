import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParamsPanel } from "../prompt/ParamsPanel";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import type { PromptFile } from "../../../../shared/ipc/prompts";

const base: PromptFile = {
  name: "t", system: "", user: "", model: null, params: {},
  created_at: "t", updated_at: "t", auto_rerun: false,
};

beforeEach(() => {
  useWorkspacesStore.setState({
    root: "/ws", tree: [], currentPath: "/ws/t.quantamind.yaml",
    current: { ...base, params: {} }, dirty: false,
  });
});

describe("ParamsPanel", () => {
  it("renders nothing when no prompt is open", () => {
    useWorkspacesStore.setState({ current: null });
    const { container } = render(<ParamsPanel running={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("expands to show all six param rows", () => {
    render(<ParamsPanel running={false} />);
    fireEvent.click(screen.getByText(/Parameters/));
    for (const k of ["temperature", "top_p", "top_k", "max_tokens", "repeat_penalty", "seed"]) {
      expect(screen.getByTestId(`param-${k}`)).toBeTruthy();
    }
  });

  it("editing a numeric input writes to the store and marks dirty", () => {
    render(<ParamsPanel running={false} />);
    fireEvent.click(screen.getByText(/Parameters/));
    fireEvent.change(screen.getByTestId("param-temperature-input"), { target: { value: "0.3" } });
    const s = useWorkspacesStore.getState();
    expect(s.current?.params.temperature).toBe(0.3);
    expect(s.dirty).toBe(true);
  });

  it("clearing an input resets the field to undefined", () => {
    useWorkspacesStore.setState({ current: { ...base, params: { seed: 42 } } });
    render(<ParamsPanel running={false} />);
    fireEvent.click(screen.getByText(/Parameters/));
    fireEvent.change(screen.getByTestId("param-seed-input"), { target: { value: "" } });
    expect(useWorkspacesStore.getState().current?.params.seed).toBeUndefined();
  });

  it("shows the 'applies on next run' badge while running", () => {
    render(<ParamsPanel running={true} />);
    expect(screen.getByText(/applies on next run/)).toBeTruthy();
  });

  it("reset button clears a set value", () => {
    useWorkspacesStore.setState({ current: { ...base, params: { top_k: 40 } } });
    render(<ParamsPanel running={false} />);
    fireEvent.click(screen.getByText(/Parameters/));
    fireEvent.click(screen.getByLabelText("Reset Top K"));
    expect(useWorkspacesStore.getState().current?.params.top_k).toBeUndefined();
  });
});
