import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { AddModelModal } from "../AddModelModal";
import { useModelStore } from "../../state/modelStore";

beforeEach(() => {
  useModelStore.setState({ activeTab: "ollama", downloads: {} });
});

describe("AddModelModal (M.3)", () => {
  it("renders dialog with aria-modal when isOpen", () => {
    render(<AddModelModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("add-model-modal")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-labelledby",
      "add-model-title",
    );
  });

  it("does not render when isOpen=false", () => {
    render(<AddModelModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByTestId("add-model-modal")).toBeNull();
  });

  it("clicking Close and pressing Escape both invoke onClose", () => {
    const onClose = vi.fn();
    const { rerender } = render(<AddModelModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<AddModelModal isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("clicking a tab and Cmd+1..5 both update the store", () => {
    render(<AddModelModal isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "Hugging Face" }));
    expect(useModelStore.getState().activeTab).toBe("huggingface");
    fireEvent.keyDown(document, { key: "3", metaKey: true });
    expect(useModelStore.getState().activeTab).toBe("local");
    fireEvent.keyDown(document, { key: "4", metaKey: true });
    expect(useModelStore.getState().activeTab).toBe("downloads");
    fireEvent.keyDown(document, { key: "5", metaKey: true });
    expect(useModelStore.getState().activeTab).toBe("storage");
    fireEvent.keyDown(document, { key: "1", metaKey: true });
    expect(useModelStore.getState().activeTab).toBe("ollama");
  });

  it("Tab on last focusable wraps to first; Shift+Tab on first wraps to last", () => {
    render(<AddModelModal isOpen onClose={() => {}} />);
    // Type a name so the Install button is enabled — disabled buttons
    // can't receive focus and would invalidate the wrap assertion.
    fireEvent.change(screen.getByTestId("ollama-name-input"), { target: { value: "x" } });
    const modal = screen.getByTestId("add-model-modal");
    const buttons = modal.querySelectorAll<HTMLButtonElement>("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("renders the correct tab content for each active tab", () => {
    render(<AddModelModal isOpen onClose={() => {}} />);
    expect(screen.getByTestId("tab-ollama")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Hugging Face" }));
    expect(screen.getByTestId("tab-huggingface")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-ollama")).toBeNull();
  });

  it("active download from store renders in footer", () => {
    useModelStore.setState({
      activeTab: "ollama",
      downloads: {
        "phi3.5:latest": {
          id: "phi3.5:latest", source: "ollama", name: "phi3.5:latest",
          status: "downloading", percent: 47,
        },
      },
    });
    render(<AddModelModal isOpen onClose={() => {}} />);
    const footer = screen.getByTestId("modal-footer");
    expect(footer).toHaveTextContent("Installing phi3.5:latest");
    expect(footer).toHaveTextContent("47%");
  });

  it("restores focus to previously-focused element on close", () => {
    const ext = document.createElement("button");
    document.body.appendChild(ext);
    ext.focus();
    expect(document.activeElement).toBe(ext);
    const { rerender } = render(<AddModelModal isOpen onClose={() => {}} />);
    rerender(<AddModelModal isOpen={false} onClose={() => {}} />);
    expect(document.activeElement).toBe(ext);
    document.body.removeChild(ext);
  });
});
