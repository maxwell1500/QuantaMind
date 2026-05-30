import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../shared/ipc/workspace/history", () => ({
  historyAppend: vi.fn().mockResolvedValue(undefined),
}));

import { recordRun } from "../recordRun";
import { historyAppend } from "../../../shared/ipc/workspace/history";

beforeEach(() => vi.clearAllMocks());

describe("recordRun", () => {
  it("appends a run with the right shape", async () => {
    await recordRun(
      { name: "summarize", model: "llama3", prompt: "hi", system: "sys", params: { seed: 7 }, promptPath: "/ws/a.yaml" },
      "the output",
      { token_count: 12, ttft_ms: 120, tokens_per_sec: 40, load_ms: 2400 },
    );
    expect(historyAppend).toHaveBeenCalledWith({
      name: "summarize",
      prompt_path: "/ws/a.yaml",
      model: "llama3",
      system: "sys",
      user: "hi",
      params: { seed: 7 },
      output: "the output",
      token_count: 12,
      ttft_ms: 120,
      tokens_per_sec: 40,
      load_ms: 2400,
    });
  });

  it("skips when there is no context", async () => {
    await recordRun(null, "out", { token_count: 1 });
    expect(historyAppend).not.toHaveBeenCalled();
  });

  it("skips when output is empty (e.g. immediate cancel)", async () => {
    await recordRun({ model: "m", prompt: "p" }, "", { token_count: 0 });
    expect(historyAppend).not.toHaveBeenCalled();
  });

  it("defaults missing optional context fields and metrics", async () => {
    await recordRun({ model: "m", prompt: "p" }, "out", { token_count: 3 });
    expect(historyAppend).toHaveBeenCalledWith({
      name: "", prompt_path: null, model: "m", system: "", user: "p", params: {}, output: "out",
      token_count: 3, ttft_ms: null, tokens_per_sec: null, load_ms: null,
    });
  });
});
