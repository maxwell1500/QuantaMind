import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { HelpPage } from "../components/HelpPage";
import { HELP_SECTIONS } from "../components/helpSections";

describe("HelpPage", () => {
  it("renders the page heading and the TOC", () => {
    render(<HelpPage />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByTestId("help-toc")).toBeInTheDocument();
  });

  it("renders one article per HELP_SECTIONS entry, each with its title and body", () => {
    render(<HelpPage />);
    for (const s of HELP_SECTIONS) {
      const article = screen.getByTestId(`help-section-${s.id}`);
      expect(article).toBeInTheDocument();
      expect(article).toHaveTextContent(s.title);
      for (const para of s.body) {
        const firstWords = para.split(" ").slice(0, 4).join(" ");
        expect(article).toHaveTextContent(firstWords);
      }
    }
  });

  it("TOC anchor count matches the section count", () => {
    render(<HelpPage />);
    const toc = screen.getByTestId("help-toc");
    expect(toc.querySelectorAll("a").length).toBe(HELP_SECTIONS.length);
  });
});
