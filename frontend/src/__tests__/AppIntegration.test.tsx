import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <textarea
      data-testid="prompt-input"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import App from "../App";
import { useWorkspacesStore } from "../features/workspaces/state/workspaceStore";
import { seedCurrentPrompt } from "./helpers/seedWorkspace";

const handlers: Record<string, EventCallback<unknown>> = {};

function fire(event: string, payload: unknown) {
  handlers[event]({ event, id: 0, payload });
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => {
      delete handlers[event];
    });
  });
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_models")
      return Promise.resolve(["llama3.2:1b", "mistral:7b"]);
    if (cmd === "get_installed_models_with_stats")
      return Promise.resolve([
        { name: "llama3.2:1b", size_bytes: 1_000_000_000, modified_at: "", family: "llama", parameter_size: "1B", quantization: "Q4_K_M" },
        { name: "mistral:7b", size_bytes: 4_000_000_000, modified_at: "", family: "llama", parameter_size: "7B", quantization: "Q4_K_M" },
      ]);
    if (cmd === "check_ollama_health")
      return Promise.resolve({ available: true, version: "0.1.32" });
    if (cmd === "run_prompt") return Promise.resolve();
    if (cmd === "stop_prompt") return Promise.resolve();
    if (cmd === "save_prompt") return Promise.resolve(useWorkspacesStore.getState().current);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  seedCurrentPrompt();
});

describe("Phase 1 E2E smoke — edit → run → re-run", () => {
  it("walks the full workspace flow with all four exit criteria", async () => {
    render(<App />);
    await waitFor(() =>
      expect(handlers["prompt-token"]).toBeDefined(),
    );

    // 1. EDIT — Workspace now has two PromptEditors (system + user); scope to user
    const userEditorWrap = await screen.findByTestId("user-prompt-editor");
    const editor = within(userEditorWrap).getByTestId("prompt-input");
    fireEvent.change(editor, { target: { value: "Why is the sky blue?" } });
    const select = (await screen.findByRole("combobox", {
      name: /model/i,
    })) as HTMLSelectElement;
    await screen.findByRole("option", { name: "llama3.2:1b" });
    fireEvent.change(select, { target: { value: "llama3.2:1b" } });

    // 2. RUN — tokens stream into UI, metrics displayed
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("run_prompt", {
        model: "llama3.2:1b",
        prompt: "Why is the sky blue?",
      }),
    );
    act(() => {
      fire("prompt-token", { text: "The " });
      fire("prompt-token", { text: "sky " });
      fire("prompt-token", { text: "is " });
      fire("prompt-token", { text: "blue." });
    });
    act(() => {
      fire("prompt-done", { ttft_ms: 8, tokens_per_sec: 32.0, token_count: 4 });
    });
    expect(screen.getByTestId("output-stream")).toHaveTextContent(
      "The sky is blue.",
    );
    const inline = screen.getByTestId("metrics");
    const bar = screen.getByTestId("status-bar-metrics");
    const expected = "TTFT 8ms · 32.0 tok/s · 4 tokens";
    expect(inline).toHaveTextContent(expected);
    expect(bar).toHaveTextContent(expected);
    expect(inline.textContent).toEqual(bar.textContent);
    expect(screen.getByTestId("run-status")).toHaveTextContent("done");

    // 3. RE-RUN with the same in-memory state succeeds without re-typing
    expect(select.value).toBe("llama3.2:1b");
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(invoke).toHaveBeenCalledWith("run_prompt", {
      model: "llama3.2:1b",
      prompt: "Why is the sky blue?",
    });
  });

  it("cancel mid-stream produces a distinct cancelled terminal state", async () => {
    render(<App />);
    await waitFor(() => expect(handlers["prompt-cancelled"]).toBeDefined());
    const userWrap = await screen.findByTestId("user-prompt-editor");
    fireEvent.change(within(userWrap).getByTestId("prompt-input"), {
      target: { value: "x" },
    });
    await screen.findByRole("option", { name: "llama3.2:1b" });
    fireEvent.change(
      screen.getByRole("combobox", { name: /model/i }) as HTMLSelectElement,
      { target: { value: "llama3.2:1b" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    act(() => fire("prompt-token", { text: "partial" }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("stop_prompt"));
    act(() => fire("prompt-cancelled", { token_count: 1 }));
    expect(screen.getByTestId("run-status")).toHaveTextContent("cancelled");
    expect(screen.getByTestId("cancelled-info")).toHaveTextContent(
      "Cancelled · 1 tokens",
    );
    expect(screen.queryByTestId("metrics")).toBeNull();
  });
});
