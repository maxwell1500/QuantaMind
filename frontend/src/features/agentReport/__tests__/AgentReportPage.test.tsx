import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../shared/ipc/eval/readiness", () => ({
  listReadinessProfiles: vi.fn(),
  assessReadiness: vi.fn(),
}));

import { listReadinessProfiles, assessReadiness, type ReadinessProfile } from "../../../shared/ipc/eval/readiness";
import { AgentReportPage } from "../components/AgentReportPage";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useReadinessStore } from "../state/readinessStore";

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
  useEvalRegistryStore.setState({ presets: [{ id: "curated", label: "Curated Suite" }], collections: ["finance"], selected: "finance" });
  useReadinessStore.setState({ profiles: [], selectedProfileId: "", verdicts: [], assessed: false, loading: false, error: null });
  vi.mocked(listReadinessProfiles).mockResolvedValue([profile("coding-agent", "Coding agent", 0.8)]);
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
    fireEvent.click(screen.getByTestId("readiness-run"));
    await waitFor(() => expect(assessReadiness).toHaveBeenCalledWith("finance", "coding-agent"));
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
