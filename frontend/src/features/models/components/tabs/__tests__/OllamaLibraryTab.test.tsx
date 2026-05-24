import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { OllamaLibraryTab } from "../OllamaLibraryTab";
import { useModelStore } from "../../../state/modelStore";
import { __resetDownloadEventBusForTests } from "../../../state/downloadEventBus";

const handlers: Record<string, EventCallback<unknown>> = {};

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_models") return Promise.resolve(["mistral:7b"]);
    if (cmd === "pull_model") return Promise.resolve("pull-1");
    if (cmd === "cancel_pull") return Promise.resolve(undefined);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  __resetDownloadEventBusForTests();
  useModelStore.setState({ downloads: {}, pullNames: {}, activeHfName: null });
});

describe("OllamaLibraryTab (free-text install)", () => {
  it("renders the input and a disabled Install button when empty", () => {
    render(<OllamaLibraryTab />);
    expect(screen.getByTestId("ollama-name-input")).toBeInTheDocument();
    expect(screen.getByTestId("ollama-install")).toBeDisabled();
  });

  it("typing an installed model name shows the Installed badge", async () => {
    render(<OllamaLibraryTab />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("list_models"));
    fireEvent.change(screen.getByTestId("ollama-name-input"), { target: { value: "mistral:7b" } });
    await screen.findByText(/Installed/);
  });

  it("clicking Install invokes pull_model with the typed name", async () => {
    render(<OllamaLibraryTab />);
    fireEvent.change(screen.getByTestId("ollama-name-input"), { target: { value: "qwen2.5:14b" } });
    fireEvent.click(screen.getByTestId("ollama-install"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("pull_model", { name: "qwen2.5:14b" }));
  });

  it("surfaces a pull_model rejection as a friendly error", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "list_models") return Promise.resolve([]);
      if (cmd === "pull_model") return Promise.reject({ kind: "not_found", message: "model foo" });
      return Promise.reject(new Error(`unknown ${cmd}`));
    });
    render(<OllamaLibraryTab />);
    fireEvent.change(screen.getByTestId("ollama-name-input"), { target: { value: "foo" } });
    fireEvent.click(screen.getByTestId("ollama-install"));
    // not_found kind now renders as a friendly "model wasn't found / check the tag" hint
    expect(await screen.findByTestId("ollama-error")).toHaveTextContent(/wasn't found/i);
  });

  it("Enter triggers the install when the name is non-empty", async () => {
    render(<OllamaLibraryTab />);
    const input = screen.getByTestId("ollama-name-input");
    fireEvent.change(input, { target: { value: "phi3:mini" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("pull_model", { name: "phi3:mini" }));
  });
});
