import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listModels } from "../client";

describe("ipc client", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("listModels invokes the list_models command and returns its result", async () => {
    vi.mocked(invoke).mockResolvedValue(["llama3.2:1b", "mistral:7b"]);
    const result = await listModels();
    expect(invoke).toHaveBeenCalledWith("list_models");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result).toEqual(["llama3.2:1b", "mistral:7b"]);
  });
});
