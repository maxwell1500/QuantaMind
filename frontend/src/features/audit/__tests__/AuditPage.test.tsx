import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
// The probe + timeline have their own suites; stub them for a composition check.
vi.mock("../../eval/components/ContextCliffPanel", () => ({ ContextCliffPanel: () => <div data-testid="cliff-panel" /> }));
vi.mock("../../eval/components/matrix/HistoryTimeline", () => ({ HistoryTimeline: () => <div data-testid="history-timeline" /> }));

import { AuditPage } from "../components/AuditPage";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";

beforeEach(() => {
  useEvalRegistryStore.setState({ presets: [{ id: "curated", label: "Curated Suite" }], collections: [], init: vi.fn().mockResolvedValue(undefined) });
});

describe("AuditPage", () => {
  it("mounts the saved-history section, the export, and the Context-Cliff probe", async () => {
    render(<AuditPage />);
    expect(screen.getByTestId("tab-audit")).toBeInTheDocument();
    expect(screen.getByTestId("audit-history")).toBeInTheDocument();
    expect(screen.getByTestId("audit-export-csv")).toBeDisabled(); // no run yet
    expect(screen.getByTestId("cliff-panel")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());
  });
});
