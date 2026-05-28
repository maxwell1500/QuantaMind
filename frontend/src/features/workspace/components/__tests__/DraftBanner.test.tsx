import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DraftBanner } from "../DraftBanner";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import type { PromptFile } from "../../../../shared/ipc/prompts";

const draft = (over: Partial<PromptFile> = {}): PromptFile => ({
  name: "crdt-explainer", system: "", user: "hi", model: null, params: {},
  created_at: "", updated_at: "", auto_rerun: false, ...over,
});

const saveAs = vi.fn();

beforeEach(() => {
  saveAs.mockReset();
  useWorkspacesStore.setState({ root: "/ws", tree: [], currentPath: null, current: null, saveAs });
});

describe("DraftBanner", () => {
  it("is hidden when a prompt file is open (currentPath set)", () => {
    useWorkspacesStore.setState({ currentPath: "/ws/a.quantamind.yaml", current: draft() });
    const { container } = render(<DraftBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("one-click Save persists the draft under its name", () => {
    useWorkspacesStore.setState({ current: draft() });
    render(<DraftBanner />);
    fireEvent.click(screen.getByTestId("draft-save"));
    expect(saveAs).toHaveBeenCalledWith("crdt-explainer");
  });

  it("dedupes the name against existing files in the folder", () => {
    useWorkspacesStore.setState({
      current: draft(),
      tree: [{ kind: "file", name: "crdt-explainer.quantamind.yaml", path: "/ws/crdt-explainer.quantamind.yaml" }],
    });
    render(<DraftBanner />);
    fireEvent.click(screen.getByTestId("draft-save"));
    expect(saveAs).toHaveBeenCalledWith("crdt-explainer-2");
  });

  it("falls back to 'untitled' for an unnamed draft", () => {
    useWorkspacesStore.setState({ current: draft({ name: "restored" }) });
    render(<DraftBanner />);
    fireEvent.click(screen.getByTestId("draft-save"));
    expect(saveAs).toHaveBeenCalledWith("untitled");
  });
});
