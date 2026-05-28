import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn().mockResolvedValue(undefined) }));

import { Markdown } from "../markdown";
import { open } from "@tauri-apps/plugin-shell";

beforeEach(() => vi.clearAllMocks());

describe("Markdown", () => {
  it("renders bold and inline code", () => {
    render(<Markdown text="Now **faster** with `cache`." />);
    expect(screen.getByText("faster").tagName).toBe("STRONG");
    expect(screen.getByText("cache").tagName).toBe("CODE");
  });

  it("renders headings", () => {
    render(<Markdown text="## What's new" />);
    expect(screen.getByText("What's new")).toBeTruthy();
  });

  it("renders bullet lines", () => {
    render(<Markdown text={"- first\n- second"} />);
    expect(screen.getByText(/first/)).toBeTruthy();
    expect(screen.getByText(/second/)).toBeTruthy();
  });

  it("opens links in the system browser", () => {
    render(<Markdown text="See [docs](https://quantamind.co/docs)." />);
    fireEvent.click(screen.getByText("docs"));
    expect(open).toHaveBeenCalledWith("https://quantamind.co/docs");
  });

  it("skips blank lines without crashing", () => {
    render(<Markdown text={"line one\n\nline two"} />);
    expect(screen.getByText("line one")).toBeTruthy();
    expect(screen.getByText("line two")).toBeTruthy();
  });
});
