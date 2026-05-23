import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../../../shared/ipc/hf_install", () => ({
  cancelHfInstall: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { cancelHfInstall } from "../../../../../shared/ipc/hf_install";
import { DownloadsActive } from "../DownloadsActive";
import { useModelStore } from "../../../state/modelStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(cancelHfInstall).mockReset();
  useModelStore.setState({ downloads: {}, activeTab: "downloads" });
});

describe("DownloadsActive", () => {
  it("shows empty copy when no entries are in flight", () => {
    render(<DownloadsActive />);
    expect(screen.getByTestId("downloads-empty-active")).toBeInTheDocument();
  });

  it("renders active HF entry with progress, percent, and a Cancel button", () => {
    useModelStore.getState().upsertDownload({
      id: "qwen", source: "huggingface", name: "qwen",
      status: "downloading", percent: 42, bytesCompleted: 4200, bytesTotal: 10000,
    });
    render(<DownloadsActive />);
    const item = screen.getByTestId("download-active-qwen");
    expect(item).toHaveTextContent("42%");
    expect(item.querySelector("progress")).toHaveAttribute("value", "42");
    expect(screen.getByRole("button", { name: /cancel qwen/i })).toBeInTheDocument();
  });

  it("Cancel success removes entry and shows green status toast", async () => {
    vi.mocked(cancelHfInstall).mockResolvedValue(undefined);
    useModelStore.getState().upsertDownload({
      id: "ok", source: "huggingface", name: "ok",
      status: "downloading", percent: 10,
    });
    render(<DownloadsActive />);
    fireEvent.click(screen.getByRole("button", { name: /cancel ok/i }));
    await waitFor(() => expect(screen.getByTestId("cancel-toast")).toBeInTheDocument());
    expect(screen.getByTestId("cancel-toast")).toHaveTextContent(/Cancelled ok/);
    expect(useModelStore.getState().downloads["ok"]).toBeUndefined();
  });

  it("Cancel rejection keeps entry and shows red error", async () => {
    vi.mocked(cancelHfInstall).mockRejectedValue(new Error("backend already done"));
    useModelStore.getState().upsertDownload({
      id: "bad", source: "huggingface", name: "bad",
      status: "downloading", percent: 10,
    });
    render(<DownloadsActive />);
    fireEvent.click(screen.getByRole("button", { name: /cancel bad/i }));
    await waitFor(() => expect(screen.getByTestId("cancel-error")).toBeInTheDocument());
    expect(screen.getByTestId("cancel-error")).toHaveTextContent(/Cancel for bad failed/);
    expect(useModelStore.getState().downloads["bad"]).toBeDefined();
  });

  it("local-source entries render without a Cancel button (no backend cancel)", () => {
    useModelStore.getState().upsertDownload({
      id: "localmodel", source: "local", name: "localmodel",
      status: "installing", percent: 50,
    });
    render(<DownloadsActive />);
    expect(screen.queryByRole("button", { name: /cancel localmodel/i })).toBeNull();
  });
});
