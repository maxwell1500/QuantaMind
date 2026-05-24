import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { ExportButtons } from "../components/ExportButtons";
import { useCompareStore } from "../state/compareStore";

const ROW = (model: string) => ({
  model, modelId: "u", status: "done" as const, output: "hi",
  metrics: { ttft_ms: 10, tokens_per_sec: 30, token_count: 3 },
  error: null, startedAt: "s", endedAt: "e",
});

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(save).mockReset();
  vi.mocked(invoke).mockResolvedValue(undefined);
  useCompareStore.getState().reset();
});

describe("ExportButtons", () => {
  it("both buttons are disabled when there are no rows yet", () => {
    render(<ExportButtons />);
    expect(screen.getByTestId("export-md")).toBeDisabled();
    expect(screen.getByTestId("export-json")).toBeDisabled();
  });

  it("Export Markdown invokes save_compare_report with .md path and markdown contents", async () => {
    useCompareStore.setState({ prompt: "p", rows: [ROW("a")] });
    vi.mocked(save).mockResolvedValue("/tmp/out.md");
    render(<ExportButtons />);
    await act(async () => { fireEvent.click(screen.getByTestId("export-md")); });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "save_compare_report");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ path: "/tmp/out.md", format: "md" });
    expect((call![1] as { contents: string }).contents).toMatch(/^# QuantaMind Compare Report/);
  });

  it("Export JSON invokes save_compare_report with .json path and parseable JSON contents", async () => {
    useCompareStore.setState({ prompt: "p", rows: [ROW("a")] });
    vi.mocked(save).mockResolvedValue("/tmp/out.json");
    render(<ExportButtons />);
    await act(async () => { fireEvent.click(screen.getByTestId("export-json")); });
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "save_compare_report");
    expect(call).toBeDefined();
    expect(call![1]).toMatchObject({ path: "/tmp/out.json", format: "json" });
    const contents = (call![1] as { contents: string }).contents;
    expect(() => JSON.parse(contents)).not.toThrow();
  });

  it("when the user cancels the dialog (save returns null) the IPC is not called", async () => {
    useCompareStore.setState({ prompt: "p", rows: [ROW("a")] });
    vi.mocked(save).mockResolvedValue(null);
    render(<ExportButtons />);
    await act(async () => { fireEvent.click(screen.getByTestId("export-md")); });
    expect(invoke).not.toHaveBeenCalledWith("save_compare_report", expect.anything());
  });

  it("surfaces a friendly error when the backend write fails", async () => {
    useCompareStore.setState({ prompt: "p", rows: [ROW("a")] });
    vi.mocked(save).mockResolvedValue("/tmp/out.md");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "save_compare_report") return Promise.reject({ kind: "io", message: "no space" });
      return Promise.resolve(undefined);
    });
    render(<ExportButtons />);
    await act(async () => { fireEvent.click(screen.getByTestId("export-md")); });
    expect(await screen.findByTestId("export-error")).toHaveTextContent(/no space/);
  });
});
