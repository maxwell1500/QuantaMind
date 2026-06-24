import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HfVariantTable } from "../components/HfVariantTable";
import type { HfVariantView } from "../hooks/useHfRepoVariants";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";

const GB = 1024 ** 3;
const variants: HfVariantView[] = [
  { filename: "tiny.Q4_K_M.gguf", quantization: "Q4_K_M", sizeBytes: 1 * GB },
  { filename: "huge.Q8_0.gguf", quantization: "Q8_0", sizeBytes: 40 * GB },
];
const hw = (avail: number): HardwareSnapshot => ({
  total_memory_bytes: avail,
  available_memory_bytes: avail,
  is_apple_silicon: true,
});

const base = { variants, installed: new Set<string>(), busy: false, nameOf: (v: HfVariantView) => v.filename, onInstall: vi.fn() };

describe("HfVariantTable fit column", () => {
  it("shows a per-variant fit badge when a snapshot is present", () => {
    render(<HfVariantTable {...base} snapshot={hw(16 * GB)} />);
    expect(screen.getByTestId("variant-fit-Q4_K_M")).toHaveTextContent("Fits");
    expect(screen.getByTestId("variant-fit-Q8_0")).toHaveTextContent("Won't fit");
  });

  it("omits the fit column when no snapshot (never guesses)", () => {
    render(<HfVariantTable {...base} snapshot={null} />);
    expect(screen.queryByTestId("variant-fit-Q4_K_M")).toBeNull();
  });
});
