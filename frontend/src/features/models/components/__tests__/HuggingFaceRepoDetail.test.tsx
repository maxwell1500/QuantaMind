import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { HuggingFaceRepoDetail } from "../HuggingFaceRepoDetail";
import { useModelStore } from "../../state/modelStore";
import { __resetDownloadEventBusForTests } from "../../state/downloadEventBus";

const REPO = "bartowski/Test-7B-Instruct-GGUF";
const FILES = [
  { path: "Test-7B-Q4_K_M.gguf", size_bytes: 4_000_000_000 },
  { path: "Test-7B-Q5_K_M.gguf", size_bytes: 5_000_000_000 },
];
const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) => handlers[event]({ event, id: 0, payload });

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "hf_repo_files") return Promise.resolve(FILES);
    if (cmd === "list_models") return Promise.resolve([]);
    if (cmd === "install_hf_gguf") return Promise.resolve(undefined);
    if (cmd === "cancel_hf_install") return Promise.resolve(undefined);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  __resetDownloadEventBusForTests();
  useModelStore.setState({ downloads: {}, pullNames: {}, activeHfName: null });
});

describe("HuggingFaceRepoDetail (live variants)", () => {
  it("fetches variants via hf_repo_files and renders rows with parsed quants", async () => {
    render(<HuggingFaceRepoDetail repo={REPO} onBack={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("hf_repo_files", { repo: REPO }));
    expect(await screen.findByTestId("variant-Q4_K_M")).toHaveTextContent("Q4_K_M");
    expect(screen.getByTestId("variant-Q5_K_M")).toHaveTextContent("Q5_K_M");
    expect(screen.getByTestId("variant-Q4_K_M")).toHaveTextContent(/3\.7GB|4\.0GB/);
  });

  it("Install invokes install_hf_gguf with repo, filename, and base:quant name", async () => {
    render(<HuggingFaceRepoDetail repo={REPO} onBack={() => {}} />);
    await screen.findByTestId("variant-Q4_K_M");
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /install/i })[0]);
    });
    expect(invoke).toHaveBeenCalledWith("install_hf_gguf", expect.objectContaining({
      repo: REPO,
      filename: "Test-7B-Q4_K_M.gguf",
      name: "test-7b:q4_k_m",
    }));
  });

  it("shows a friendly error when hf_repo_files rejects, with a Retry button", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "hf_repo_files") return Promise.reject({ kind: "inference", message: "HF down" });
      return Promise.resolve([]);
    });
    render(<HuggingFaceRepoDetail repo={REPO} onBack={() => {}} />);
    expect(await screen.findByTestId("hf-detail-error")).toHaveTextContent(/HF down/);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("installing event flips status to 'Installing…'", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "hf_repo_files") return Promise.resolve(FILES);
      if (cmd === "list_models") return Promise.resolve([]);
      if (cmd === "install_hf_gguf") return new Promise(() => {});
      return Promise.reject(new Error(`unknown ${cmd}`));
    });
    render(<HuggingFaceRepoDetail repo={REPO} onBack={() => {}} />);
    await screen.findByTestId("variant-Q4_K_M");
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: /install/i })[0]);
    });
    act(() => fire("hf-progress", { phase: "installing" }));
    expect(screen.getByTestId("hf-installing")).toBeInTheDocument();
  });
});
