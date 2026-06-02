import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelCardReader } from "../components/card/ModelCardReader";

describe("ModelCardReader", () => {
  it("maps headings and isolates code fences", () => {
    render(<ModelCardReader markdown={"# Title\n```\ncode line\n```\nbody"} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Title");
    expect(screen.getByText("code line").tagName).toBe("PRE");
  });

  it("renders raw HTML as inert text — never injects it into the DOM", () => {
    const { container } = render(
      <ModelCardReader markdown={'<table><tr><td>cell</td></tr></table>'} />,
    );
    // The line is shown verbatim in a <pre>, not parsed into a real <table>.
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText(/<table>/)).toBeTruthy();
  });

  it("renders <script> as inert text (no injection)", () => {
    const { container } = render(
      <ModelCardReader markdown={'<script>alert(1)</script>'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>/)).toBeTruthy();
  });

  it("drops HTML comments (single- and multi-line)", () => {
    render(
      <ModelCardReader markdown={"<!-- ### quantize_version: 2 -->\n# Real\n<!--\nmulti\nline\n-->\nbody"} />,
    );
    expect(screen.queryByText(/quantize_version/)).toBeNull();
    expect(screen.queryByText(/multi/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Real" })).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("collapses markdown links and images to their label (no URL spam, no injection)", () => {
    render(<ModelCardReader markdown={"See [GGUF](https://huggingface.co/x.gguf) and ![img](http://e/p.png)"} />);
    const p = screen.getByText(/See GGUF and img/);
    expect(p.textContent).not.toContain("https://");
    expect(p.querySelector("a")).toBeNull();
  });
});
