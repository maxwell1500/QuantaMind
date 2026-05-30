import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VramBar } from "../VramBar";

describe("VramBar", () => {
  it("shows 'not available' with no entry", () => {
    render(<VramBar />);
    expect(screen.getByTestId("vram-na")).toBeInTheDocument();
    expect(screen.queryByTestId("vram-bar")).toBeNull();
  });

  it("renders a single in-VRAM segment for a fully-resident model", () => {
    render(<VramBar entry={{ name: "m", size_bytes: 4_000_000_000, size_vram_bytes: 4_000_000_000, context_length: 4096 }} />);
    expect(screen.getByTestId("vram-seg-vram")).toBeInTheDocument();
    expect(screen.queryByTestId("vram-seg-offload")).toBeNull();
    expect(screen.getByText(/in VRAM of/)).toBeInTheDocument();
    expect(screen.getByText(/4096 ctx/)).toBeInTheDocument();
  });

  it("renders both segments for a partially-offloaded model", () => {
    render(<VramBar entry={{ name: "m", size_bytes: 1000, size_vram_bytes: 600 }} />);
    expect(screen.getByTestId("vram-seg-vram")).toBeInTheDocument();
    expect(screen.getByTestId("vram-seg-offload")).toBeInTheDocument();
  });
});
