import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HostHardwareProfile } from "../components/HostHardwareProfile";
import { GIB } from "../capBytes";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";

const hw: HardwareSnapshot = {
  total_memory_bytes: 64 * GIB,
  available_memory_bytes: 32 * GIB,
  is_apple_silicon: false,
  gpu: { unified: false, available: true, name: "RTX 4090", vram_total_bytes: 24 * GIB },
};

describe("HostHardwareProfile", () => {
  it("shows the detected arch and a cap dropdown set to the current cap", () => {
    render(<HostHardwareProfile hardware={hw} capBytes={24 * GIB} onCapChange={() => {}} />);
    expect(screen.getByTestId("host-hardware-profile")).toHaveTextContent("RTX 4090");
    expect((screen.getByTestId("readiness-cap-select") as HTMLSelectElement).value).toBe(String(24 * GIB));
  });

  it("calls onCapChange with the chosen byte value", () => {
    const onCapChange = vi.fn();
    render(<HostHardwareProfile hardware={hw} capBytes={24 * GIB} onCapChange={onCapChange} />);
    fireEvent.change(screen.getByTestId("readiness-cap-select"), { target: { value: String(8 * GIB) } });
    expect(onCapChange).toHaveBeenCalledWith(8 * GIB);
  });
});
