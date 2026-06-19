import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../shared/ipc/eval/readiness", () => ({
  listReadinessProfiles: vi.fn(),
  assessReadiness: vi.fn(),
}));
vi.mock("../../../shared/ipc/compare/hardware", () => ({ getHardwareSnapshot: vi.fn() }));

import { listReadinessProfiles, assessReadiness, type ReadinessProfile } from "../../../shared/ipc/eval/readiness";
import { getHardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { AgentReportPage } from "../components/AgentReportPage";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useReadinessStore } from "../state/readinessStore";
import { GIB } from "../capBytes";

const profile = (id: string, name: string, min: number): ReadinessProfile => ({
  id,
  name,
  min_pass_k: min,
  max_avg_steps: null,
  max_ms_per_step: 5000,
  min_context_tokens: null,
  forbid_infinite_loop: true,
  forbid_hallucinated_completion: true,
  require_full_vram: false,
  require_native_fc: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Non-empty presets so the page doesn't trigger a registry init() in the test.
  useEvalRegistryStore.setState({ presets: [{ id: "easy-coding", label: "Coding", domain: "coding", tier: "easy" }], collections: ["finance"], selected: "finance" });
  useReadinessStore.setState({ profiles: [], selectedProfileId: "", verdicts: [], hardware: null, capBytes: null, assessed: false, loading: false, error: null });
  vi.mocked(listReadinessProfiles).mockResolvedValue([profile("coding-agent", "Coding agent", 0.8)]);
  vi.mocked(getHardwareSnapshot).mockResolvedValue({
    total_memory_bytes: 64 * GIB,
    available_memory_bytes: 32 * GIB,
    is_apple_silicon: false,
    gpu: { unified: false, available: true, name: "RTX 4090", vram_total_bytes: 24 * GIB },
  });
});

describe("AgentReportPage", () => {
  it("loads profiles and renders the active thresholds readout", async () => {
    render(<AgentReportPage />);
    await waitFor(() => expect(listReadinessProfiles).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("readiness-thresholds")).toHaveTextContent("Min Pass^k: 80%"));
  });

  it("assesses the selected collection + profile and renders the verdict table", async () => {
    vi.mocked(assessReadiness).mockResolvedValue([
      { model: "qwen", backend: "ollama", verdict: { status: "ready", blocking: [], conditions: [], path: "prompt_based" } },
    ]);
    render(<AgentReportPage />);
    await waitFor(() => expect(screen.getByTestId("readiness-profile-select")).toBeInTheDocument());
    // Wait for the detected hardware cap to populate before running.
    await waitFor(() =>
      expect((screen.getByTestId("readiness-cap-select") as HTMLSelectElement).value).toBe(String(24 * GIB)),
    );
    fireEvent.click(screen.getByTestId("readiness-run"));
    await waitFor(() => expect(assessReadiness).toHaveBeenCalledWith("finance", "coding-agent", 24 * GIB));
    await waitFor(() => expect(screen.getByTestId("readiness-verdict-table")).toBeInTheDocument());
  });

  it("shows an empty state (not a fabricated verdict) when no report is persisted", async () => {
    vi.mocked(assessReadiness).mockResolvedValue([]);
    render(<AgentReportPage />);
    await waitFor(() => expect(screen.getByTestId("readiness-profile-select")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("readiness-run"));
    await waitFor(() => expect(screen.getByTestId("readiness-empty")).toHaveTextContent("No batch report found"));
  });
});
