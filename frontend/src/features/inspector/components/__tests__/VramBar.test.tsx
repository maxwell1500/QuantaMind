import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VramBar } from "../VramBar";

const GB = 1024 ** 3;

describe("VramBar", () => {
  it("shows 'not available' with no entry", () => {
    render(<VramBar />);
    expect(screen.getByTestId("vram-na")).toBeInTheDocument();
    expect(screen.queryByTestId("vram-bar")).toBeNull();
  });

  it("scales the footprint against unified memory and labels it", () => {
    render(
      <VramBar
        entry={{ name: "m", size_bytes: 4 * GB, size_vram_bytes: 4 * GB, context_length: 4096 }}
        deviceTotalBytes={16 * GB}
        unified
      />,
    );
    expect(screen.getByTestId("vram-seg-used")).toHaveStyle({ width: "25%" });
    expect(screen.getByText(/in unified memory of 16.0GB \(25%\)/)).toBeInTheDocument();
    expect(screen.getByText(/4096 ctx/)).toBeInTheDocument();
  });

  it("notes offload to RAM for a partially-offloaded discrete GPU", () => {
    render(<VramBar entry={{ name: "m", size_bytes: 1000, size_vram_bytes: 600 }} deviceTotalBytes={4000} />);
    expect(screen.getByText(/in VRAM of/)).toBeInTheDocument();
    expect(screen.getByText(/offloaded to RAM/)).toBeInTheDocument();
  });
});
