import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheatsheetModal } from "../CheatsheetModal";
import { SHORTCUTS } from "../shortcuts";
import { useUiStore } from "../../state/uiStore";

beforeEach(() => {
  useUiStore.setState({ cheatsheetOpen: false });
});

describe("CheatsheetModal", () => {
  it("is hidden when closed", () => {
    render(<CheatsheetModal />);
    expect(screen.queryByTestId("cheatsheet-modal")).toBeNull();
  });

  it("lists every registered shortcut when open (stays in sync)", () => {
    useUiStore.setState({ cheatsheetOpen: true });
    render(<CheatsheetModal />);
    for (const s of SHORTCUTS) {
      expect(screen.getAllByText(s.label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("closes on Escape", () => {
    useUiStore.setState({ cheatsheetOpen: true });
    render(<CheatsheetModal />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useUiStore.getState().cheatsheetOpen).toBe(false);
  });

  it("closes on backdrop click", () => {
    useUiStore.setState({ cheatsheetOpen: true });
    render(<CheatsheetModal />);
    fireEvent.click(screen.getByTestId("cheatsheet-modal").parentElement as HTMLElement);
    expect(useUiStore.getState().cheatsheetOpen).toBe(false);
  });
});
