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
});
