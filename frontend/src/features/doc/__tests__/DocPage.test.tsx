import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The updater card hits Tauri IPC on mount; stub it so the page renders headless.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockRejectedValue(new Error("no backend in test")) }));

import { DocPage } from "../components/DocPage";
import { DOC_SECTIONS } from "../components/docSections";

beforeEach(() => {
  location.hash = "";
});

describe("DocPage", () => {
  it("renders the Doc heading and a sidebar entry per section", () => {
    render(<DocPage />);
    expect(screen.getByText("Doc")).toBeInTheDocument();
    const sidebar = screen.getByTestId("doc-sidebar");
    expect(sidebar.querySelectorAll("button").length).toBe(DOC_SECTIONS.length);
  });

  it("shows the first section by default with every block's What/Why/How", () => {
    render(<DocPage />);
    const first = DOC_SECTIONS[0];
    const content = screen.getByTestId(`doc-content-${first.id}`);
    expect(content).toHaveTextContent(first.title);
    for (const b of first.blocks) {
      const block = screen.getByTestId(`doc-block-${first.id}-${b.id}`);
      expect(block).toHaveTextContent(b.heading);
      expect(block).toHaveTextContent("What it does");
      expect(block).toHaveTextContent("Why it exists");
      expect(block).toHaveTextContent("How it works");
    }
  });

  it("switches the center pane when a sidebar entry is clicked", () => {
    render(<DocPage />);
    const second = DOC_SECTIONS[1];
    fireEvent.click(screen.getByTestId(`doc-nav-${second.id}`));
    expect(screen.getByTestId(`doc-content-${second.id}`)).toBeInTheDocument();
  });

  it("a metric block with a formula renders the formula and its source file", () => {
    render(<DocPage />);
    const withFormula = DOC_SECTIONS.flatMap((s) => s.blocks.map((b) => ({ s, b }))).find((x) => x.b.formula && x.b.source);
    expect(withFormula).toBeTruthy();
    fireEvent.click(screen.getByTestId(`doc-nav-${withFormula!.s.id}`));
    const block = screen.getByTestId(`doc-block-${withFormula!.s.id}-${withFormula!.b.id}`);
    expect(block).toHaveTextContent("Formula");
    expect(block).toHaveTextContent(withFormula!.b.source as string);
  });

  it("deep-links to a section named in the url hash", () => {
    location.hash = `#doc-${DOC_SECTIONS[1].id}`;
    render(<DocPage />);
    expect(screen.getByTestId(`doc-content-${DOC_SECTIONS[1].id}`)).toBeInTheDocument();
  });
});
