import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The updater card hits Tauri IPC on mount; stub it so the page renders headless.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue(new Error("no backend in test")) }));

import { HelpPage } from "../components/HelpPage";
import { HELP_SECTIONS } from "../components/helpSections";

beforeEach(() => {
  location.hash = "";
});

describe("HelpPage", () => {
  it("renders the Help heading and a sidebar entry per section", () => {
    render(<HelpPage />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    const sidebar = screen.getByTestId("help-sidebar");
    expect(sidebar.querySelectorAll("button").length).toBe(HELP_SECTIONS.length);
  });

  it("shows the first section by default with every block's What/Why/How", () => {
    render(<HelpPage />);
    const first = HELP_SECTIONS[0];
    const content = screen.getByTestId(`help-content-${first.id}`);
    expect(content).toHaveTextContent(first.title);
    for (const b of first.blocks) {
      const block = screen.getByTestId(`help-block-${first.id}-${b.id}`);
      expect(block).toHaveTextContent(b.heading);
      expect(block).toHaveTextContent("What it does");
      expect(block).toHaveTextContent("Why it exists");
      expect(block).toHaveTextContent("How it works");
    }
  });

  it("switches the center pane when a sidebar entry is clicked", () => {
    render(<HelpPage />);
    const second = HELP_SECTIONS[1];
    fireEvent.click(screen.getByTestId(`help-nav-${second.id}`));
    expect(screen.getByTestId(`help-content-${second.id}`)).toBeInTheDocument();
  });

  it("a metric block with a formula renders the formula and its source file", () => {
    render(<HelpPage />);
    const withFormula = HELP_SECTIONS.flatMap((s) => s.blocks.map((b) => ({ s, b }))).find((x) => x.b.formula && x.b.source);
    expect(withFormula).toBeTruthy();
    fireEvent.click(screen.getByTestId(`help-nav-${withFormula!.s.id}`));
    const block = screen.getByTestId(`help-block-${withFormula!.s.id}-${withFormula!.b.id}`);
    expect(block).toHaveTextContent("Formula");
    expect(block).toHaveTextContent(withFormula!.b.source as string);
  });

  it("does not include the removed 'Global controls & updates' section", () => {
    render(<HelpPage />);
    expect(HELP_SECTIONS.some((s) => s.id === "global")).toBe(false);
    expect(screen.queryByTestId("help-nav-global")).toBeNull();
  });

  it("deep-links to a section named in the url hash", () => {
    location.hash = `#help-${HELP_SECTIONS[1].id}`;
    render(<HelpPage />);
    expect(screen.getByTestId(`help-content-${HELP_SECTIONS[1].id}`)).toBeInTheDocument();
  });
});
