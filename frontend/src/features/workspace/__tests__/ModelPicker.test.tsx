import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../../shared/ipc/client", () => ({
  listModels: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { listModels } from "../../../shared/ipc/client";
import { ModelPicker } from "../components/ModelPicker";
import { useWorkspaceStore } from "../state/workspaceStore";

describe("ModelPicker", () => {
  beforeEach(() => {
    vi.mocked(listModels).mockReset();
  });

  it("renders each Ollama model name as an option", async () => {
    vi.mocked(listModels).mockResolvedValue(["llama3.2:1b", "mistral:7b"]);
    render(<ModelPicker value={null} onChange={() => {}} />);
    expect(
      await screen.findByRole("option", { name: "llama3.2:1b" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "mistral:7b" }),
    ).toBeInTheDocument();
  });

  it("fires onChange with the selected model name", async () => {
    vi.mocked(listModels).mockResolvedValue(["llama3.2:1b", "mistral:7b"]);
    const onChange = vi.fn();
    render(<ModelPicker value={null} onChange={onChange} />);
    await screen.findByRole("option", { name: "mistral:7b" });
    const select = screen.getByRole("combobox", {
      name: /model/i,
    }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "mistral:7b" } });
    expect(onChange).toHaveBeenCalledWith("mistral:7b");
  });

  it("controlled value persists across rerenders", async () => {
    vi.mocked(listModels).mockResolvedValue(["llama3.2:1b", "mistral:7b"]);
    const { rerender } = render(
      <ModelPicker value={null} onChange={() => {}} />,
    );
    await screen.findByRole("option", { name: "mistral:7b" });
    rerender(<ModelPicker value="mistral:7b" onChange={() => {}} />);
    const select = screen.getByRole("combobox", {
      name: /model/i,
    }) as HTMLSelectElement;
    expect(select.value).toBe("mistral:7b");
  });

  it("shows an error message when listModels rejects", async () => {
    vi.mocked(listModels).mockRejectedValue(new Error("HTTP 503"));
    render(<ModelPicker value={null} onChange={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 503");
  });

  it("shows friendly Ollama-down message when StatusBar marks health=false even if listModels succeeded", async () => {
    vi.mocked(listModels).mockResolvedValue(["llama3.2:1b"]);
    render(<ModelPicker value={null} onChange={() => {}} />);
    await screen.findByRole("option", { name: "llama3.2:1b" });
    useWorkspaceStore.getState().setOllamaHealthy(false);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Ollama is not running/,
    );
  });

  it("refreshes listModels once when health flips from false to true", async () => {
    vi.mocked(listModels).mockResolvedValue([]);
    useWorkspaceStore.setState({ ollamaHealthy: false });
    render(<ModelPicker value={null} onChange={() => {}} />);
    vi.mocked(listModels).mockClear();
    useWorkspaceStore.getState().setOllamaHealthy(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(listModels).toHaveBeenCalledTimes(1);
  });
});
