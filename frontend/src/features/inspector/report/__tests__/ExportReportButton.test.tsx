import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn().mockResolvedValue("/tmp/report.html") }));
vi.mock("../../../../shared/ipc/compare/hardware", () => ({ getHardwareSnapshot: vi.fn().mockResolvedValue(null) }));
vi.mock("../../../../shared/ipc/system/vram", () => ({ loadedModels: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../../shared/ipc/workspace/history", () => ({ historyList: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../../shared/ipc/compare/compare", () => ({ saveCompareReport: vi.fn().mockResolvedValue(undefined) }));

import { ExportReportButton } from "../ExportReportButton";
import { useCompareStore } from "../../../compare/state/compareStore";
import { saveCompareReport } from "../../../../shared/ipc/compare/compare";

beforeEach(() => {
  vi.clearAllMocks();
  useCompareStore.setState({
    rows: [{
      model: "m", modelId: null, status: "done", output: "x",
      metrics: { ttft_ms: 100, tokens_per_sec: 30, token_count: 2, timeline: [{ text: "a", t_ms: 100, n: 1 }, { text: "b", t_ms: 120, n: 2 }] },
      error: null, startedAt: null, endedAt: null,
    }],
  });
});

describe("ExportReportButton", () => {
  it("builds an HTML report and saves it via saveCompareReport", async () => {
    render(<ExportReportButton />);
    fireEvent.click(screen.getByTestId("export-report"));
    await waitFor(() => expect(saveCompareReport).toHaveBeenCalled());
    const [path, format, contents] = vi.mocked(saveCompareReport).mock.calls[0];
    expect(path).toBe("/tmp/report.html");
    expect(format).toBe("html");
    expect(contents).toContain("<!doctype html>");
  });
});
