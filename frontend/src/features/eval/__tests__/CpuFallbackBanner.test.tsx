import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../shared/ipc/system/vram", () => ({ loadedModels: vi.fn() }));
vi.mock("../../models/hooks/useHardwareSnapshot", () => ({ useHardwareSnapshot: vi.fn() }));

import { loadedModels } from "../../../shared/ipc/system/vram";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { CpuFallbackBanner, cpuOffload } from "../components/CpuFallbackBanner";

const GB = 1024 ** 3;
const withGpu = { snapshot: { gpu: { available: true, unified: true } } } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useHardwareSnapshot).mockReturnValue(withGpu);
});

describe("cpuOffload", () => {
  it("computes spilled bytes and percentage", () => {
    expect(cpuOffload(10 * GB, 6 * GB)).toEqual({ cpuBytes: 4 * GB, cpuPct: 40 });
    expect(cpuOffload(8 * GB, 8 * GB)).toEqual({ cpuBytes: 0, cpuPct: 0 });
  });
});

describe("CpuFallbackBanner", () => {
  it("warns when the loaded model has weights spilled to CPU", async () => {
    vi.mocked(loadedModels).mockResolvedValue([{ name: "m", size_bytes: 10 * GB, size_vram_bytes: 6 * GB }] as never);
    render(<CpuFallbackBanner model="m" backend="ollama" />);
    await waitFor(() => expect(screen.getByTestId("cpu-fallback-banner")).toHaveTextContent("40% of this model is on CPU"));
  });

  it("renders nothing when the model is fully resident", async () => {
    vi.mocked(loadedModels).mockResolvedValue([{ name: "m", size_bytes: 8 * GB, size_vram_bytes: 8 * GB }] as never);
    const { container } = render(<CpuFallbackBanner model="m" backend="ollama" />);
    await waitFor(() => expect(loadedModels).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='cpu-fallback-banner']")).toBeNull();
  });

  it("renders nothing on a non-Ollama backend", async () => {
    vi.mocked(loadedModels).mockResolvedValue([{ name: "m", size_bytes: 10 * GB, size_vram_bytes: 6 * GB }] as never);
    const { container } = render(<CpuFallbackBanner model="m" backend="mlx" />);
    expect(container.querySelector("[data-testid='cpu-fallback-banner']")).toBeNull();
  });
});
