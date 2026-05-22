import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { HuggingFaceRepoDetail } from "../HuggingFaceRepoDetail";
import type { HfRepoEntry } from "../../data/huggingface-catalog";

const ENTRY: HfRepoEntry = {
  repo: "bartowski/Test-7B-Instruct-GGUF",
  baseModel: "Test 7B Instruct",
  family: "test",
  description: "fixture",
  license: "MIT",
  variants: [
    { filename: "Test-7B-Q4_K_M.gguf", quantization: "Q4_K_M", sizeBytes: 4_000_000_000, quality: "Balanced" },
    { filename: "Test-7B-Q5_K_M.gguf", quantization: "Q5_K_M", sizeBytes: 5_000_000_000, quality: "Recommended" },
  ],
};

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
});

describe("HuggingFaceRepoDetail (M.11)", () => {
  it("renders both variants in the table", async () => {
    render(<HuggingFaceRepoDetail entry={ENTRY} onBack={() => {}} />);
    await waitFor(() => expect(handlers["hf-progress"]).toBeDefined());
    expect(screen.getByTestId("variant-Q4_K_M")).toHaveTextContent("Q4_K_M");
    expect(screen.getByTestId("variant-Q5_K_M")).toHaveTextContent("Q5_K_M");
    expect(screen.getByTestId("variant-Q4_K_M")).toHaveTextContent(/4\.0GB|3\.7GB/);
  });

  it("Install invokes install_hf_gguf with correct args; downloading progress renders", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    render(<HuggingFaceRepoDetail entry={ENTRY} onBack={() => {}} />);
    await waitFor(() => expect(handlers["hf-progress"]).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /install/i })[0]);
    });
    expect(invoke).toHaveBeenCalledWith("install_hf_gguf", expect.objectContaining({
      repo: ENTRY.repo, filename: "Test-7B-Q4_K_M.gguf",
    }));
    act(() => fire("hf-progress", {
      phase: "downloading", bytes_completed: 100_000_000, bytes_total: 4_000_000_000, speed_bps: 50_000_000,
    }));
    expect(screen.getByTestId("hf-downloading")).toHaveTextContent("Downloading · 3%");
  });

  it("invoke rejection surfaces M.12 stub error and offers dismiss", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("install_local_gguf is awaiting M.12"));
    render(<HuggingFaceRepoDetail entry={ENTRY} onBack={() => {}} />);
    await waitFor(() => expect(handlers["hf-progress"]).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /install/i })[0]);
    });
    await waitFor(() => expect(screen.getByTestId("hf-error")).toBeInTheDocument());
    expect(screen.getByTestId("hf-error")).toHaveTextContent(/M\.12/);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByTestId("hf-error")).toBeNull();
  });

  it("installing event flips status to 'Installing…'", async () => {
    vi.mocked(invoke).mockImplementation(() => new Promise(() => {}));
    render(<HuggingFaceRepoDetail entry={ENTRY} onBack={() => {}} />);
    await waitFor(() => expect(handlers["hf-progress"]).toBeDefined());
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /install/i })[0]);
    });
    act(() => fire("hf-progress", { phase: "installing" }));
    expect(screen.getByTestId("hf-installing")).toBeInTheDocument();
  });
});
