import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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

const handlers: Record<string, EventCallback<unknown>> = {};
let saved: { model: string; prompt: string } | null = null;

function fire(event: string, payload: unknown) {
  handlers[event]({ event, id: 0, payload });
}

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  saved = null;
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => {
      delete handlers[event];
    });
  });
  vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
    const a = args as Record<string, unknown> | undefined;
    if (cmd === "list_models")
      return Promise.resolve(["llama3.2:1b", "mistral:7b"]);
    if (cmd === "check_ollama_health")
      return Promise.resolve({ available: true, version: "0.1.32" });
    if (cmd === "run_prompt") return Promise.resolve();
    if (cmd === "stop_prompt") return Promise.resolve();
    if (cmd === "save_prompt") {
      saved = { model: a!.model as string, prompt: a!.prompt as string };
      return Promise.resolve();
    }
    if (cmd === "load_prompt") {
      return saved
        ? Promise.resolve(saved)
        : Promise.reject(new Error("no saved file"));
    }
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
});

describe("Phase 1 E2E smoke — edit → run → save → load → re-run", () => {
  it("walks the full workspace flow with all four exit criteria", async () => {
    render(<App />);
    await waitFor(() =>
      expect(handlers["prompt-token"]).toBeDefined(),
    );

    // 1. EDIT
    const editor = await screen.findByTestId("prompt-input");
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
    expect(screen.getByTestId("metrics")).toHaveTextContent("TTFT: 8 ms");
    expect(screen.getByTestId("metrics")).toHaveTextContent("32.0 tok/s");
    expect(screen.getByTestId("run-status")).toHaveTextContent("done");
    // display consistency: StatusBar reads the same metrics as the inline display
    const bar = screen.getByTestId("status-bar-metrics");
    expect(bar).toHaveTextContent("TTFT 8ms");
    expect(bar).toHaveTextContent("32.0 tok/s");
    expect(bar).toHaveTextContent("4 tokens");

    // 3. SAVE
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_prompt", {
        path: "./splice-current.yaml",
        model: "llama3.2:1b",
        prompt: "Why is the sky blue?",
      }),
    );

    // 4. MUTATE then LOAD restores
    fireEvent.change(editor, { target: { value: "scratch" } });
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() =>
      expect((screen.getByTestId("prompt-input") as HTMLTextAreaElement).value).toBe(
        "Why is the sky blue?",
      ),
    );
    expect(select.value).toBe("llama3.2:1b");

    // 5. RE-RUN succeeds with the restored state
    fireEvent.click(screen.getByRole("button", { name: /^run$/i }));
    expect(invoke).toHaveBeenCalledWith("run_prompt", {
      model: "llama3.2:1b",
      prompt: "Why is the sky blue?",
    });
  });

  it("cancel mid-stream invokes stop_prompt cleanly", async () => {
    render(<App />);
    await waitFor(() => expect(handlers["prompt-token"]).toBeDefined());
    fireEvent.change(await screen.findByTestId("prompt-input"), {
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
  });
});
