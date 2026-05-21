import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listModels, checkOllamaHealth } from "../client";

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

  it("checkOllamaHealth invokes check_ollama_health and returns HealthStatus", async () => {
    vi.mocked(invoke).mockResolvedValue({ available: true, version: "0.1.32" });
    const result = await checkOllamaHealth();
    expect(invoke).toHaveBeenCalledWith("check_ollama_health");
    expect(result).toEqual({ available: true, version: "0.1.32" });
  });
});
