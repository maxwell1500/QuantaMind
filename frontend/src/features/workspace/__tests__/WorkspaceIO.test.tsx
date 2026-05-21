import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { WorkspaceIO } from "../components/WorkspaceIO";

describe("WorkspaceIO", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("Save invokes save_prompt with the path/model/prompt", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    render(<WorkspaceIO model="llama3.2:1b" prompt="hi" onLoad={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("save_prompt", {
        path: "./splice-current.yaml",
        model: "llama3.2:1b",
        prompt: "hi",
      }),
    );
    expect(await screen.findByTestId("io-msg")).toHaveTextContent("saved");
  });

  it("Save without model shows guidance and skips invoke", async () => {
    render(<WorkspaceIO model={null} prompt="hi" onLoad={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByTestId("io-msg")).toHaveTextContent(
      "pick a model first",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("Load invokes load_prompt and calls onLoad with the result", async () => {
    vi.mocked(invoke).mockResolvedValue({
      model: "mistral:7b",
      prompt: "loaded body",
    });
    const onLoad = vi.fn();
    render(<WorkspaceIO model={null} prompt="" onLoad={onLoad} />);
    fireEvent.click(screen.getByRole("button", { name: /load/i }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("load_prompt", {
        path: "./splice-current.yaml",
      }),
    );
    expect(onLoad).toHaveBeenCalledWith("mistral:7b", "loaded body");
  });
});
