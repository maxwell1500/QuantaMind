import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { OllamaLibraryTab } from "../OllamaLibraryTab";
import { OllamaCatalog } from "../../../data/ollama-catalog";

const handlers: Record<string, EventCallback<unknown>> = {};

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  vi.mocked(invoke).mockResolvedValue([]);
});

const cardCount = () => screen.getByTestId("model-grid").querySelectorAll('[data-testid^="model-card-"]').length;

describe("OllamaLibraryTab (M.4)", () => {
  it("renders the full catalog when no search or filter", async () => {
    render(<OllamaLibraryTab />);
    await waitFor(() => expect(cardCount()).toBe(OllamaCatalog.length));
  });

  it("search 'llama' filters to Llama-family rows only", async () => {
    render(<OllamaLibraryTab />);
    await waitFor(() => expect(cardCount()).toBe(OllamaCatalog.length));
    fireEvent.change(screen.getByLabelText("Search Ollama library"), {
      target: { value: "llama" },
    });
    const visible = OllamaCatalog.filter((m) =>
      `${m.name} ${m.description} ${m.tags.join(" ")}`.toLowerCase().includes("llama"),
    );
    expect(cardCount()).toBe(visible.length);
    expect(visible.length).toBeGreaterThan(0);
  });

  it("'Coding' pill narrows grid to coding-tagged rows", async () => {
    render(<OllamaLibraryTab />);
    await waitFor(() => expect(cardCount()).toBe(OllamaCatalog.length));
    fireEvent.click(screen.getByRole("button", { name: "Coding" }));
    const expected = OllamaCatalog.filter((m) => m.tags.includes("coding"));
    expect(cardCount()).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("search + pill intersect (not union)", async () => {
    render(<OllamaLibraryTab />);
    await waitFor(() => expect(cardCount()).toBe(OllamaCatalog.length));
    fireEvent.change(screen.getByLabelText("Search Ollama library"), {
      target: { value: "qwen" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Coding" }));
    const expected = OllamaCatalog.filter((m) =>
      m.tags.includes("coding") &&
      `${m.name} ${m.description} ${m.tags.join(" ")}`.toLowerCase().includes("qwen"),
    );
    expect(cardCount()).toBe(expected.length);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("models returned by list_models render with the installed badge", async () => {
    vi.mocked(invoke).mockResolvedValue(["phi3.5:latest", "qwen2.5:7b"]);
    render(<OllamaLibraryTab />);
    await waitFor(() =>
      expect(screen.getByTestId("model-card-phi3.5:latest")).toBeInTheDocument(),
    );
    const phi = screen.getByTestId("model-card-phi3.5:latest");
    expect(phi.querySelector('[data-testid="installed-badge"]')).not.toBeNull();
  });
});
