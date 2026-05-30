import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/compare/hardware", () => ({ getHardwareSnapshot: vi.fn() }));

import { HardwareSection } from "../HardwareSection";
import { getHardwareSnapshot } from "../../../../shared/ipc/compare/hardware";

const base = {
  total_memory_bytes: 16 * 1024 ** 3,
  available_memory_bytes: 8 * 1024 ** 3,
  is_apple_silicon: true,
  cpu: "Apple M3 Pro",
  physical_cores: 11,
  os_name: "Darwin",
  os_version: "25.5.0",
  arch: "aarch64",
};

beforeEach(() => vi.clearAllMocks());

describe("HardwareSection", () => {
  it("renders CPU/OS/arch and a unified-memory GPU row", async () => {
    vi.mocked(getHardwareSnapshot).mockResolvedValue({
      ...base,
      gpu: { name: "Apple M3 Pro (integrated)", unified: true, available: true },
    });
    render(<HardwareSection />);
    await waitFor(() => expect(screen.getByTestId("hardware-section")).toBeInTheDocument());
    expect(screen.getByText("Apple M3 Pro")).toBeInTheDocument();
    expect(screen.getByText("Darwin 25.5.0")).toBeInTheDocument();
    expect(screen.getByText("aarch64")).toBeInTheDocument();
    expect(screen.getByText(/unified memory/)).toBeInTheDocument();
  });

  it("shows discrete VRAM for an NVIDIA GPU", async () => {
    vi.mocked(getHardwareSnapshot).mockResolvedValue({
      ...base, is_apple_silicon: false,
      gpu: { name: "RTX 4090", vram_total_bytes: 24 * 1024 ** 3, vram_free_bytes: 3 * 1024 ** 3, unified: false, available: true },
    });
    render(<HardwareSection />);
    await waitFor(() => expect(screen.getByText(/RTX 4090/)).toBeInTheDocument());
    expect(screen.getByText(/24.0GB.*3.0GB free/)).toBeInTheDocument();
  });

  it("shows 'Not available' when the GPU probe failed", async () => {
    vi.mocked(getHardwareSnapshot).mockResolvedValue({
      ...base, gpu: { unified: false, available: false },
    });
    render(<HardwareSection />);
    await waitFor(() => expect(screen.getByText("Not available")).toBeInTheDocument());
  });
});
