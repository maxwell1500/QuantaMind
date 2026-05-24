import { describe, it, expect } from "vitest";
import { buildReport } from "../format/buildReport";

const FIXED = () => new Date("2026-05-23T14:01:22.000Z");

describe("buildReport", () => {
  it("emits schema_version 1 + ISO generated_at + prompt + strategy passthrough", () => {
    const r = buildReport({
      prompt: "hi", strategy: "parallel", hardwareSnapshot: null,
      selectedModels: [], rows: [], now: FIXED,
    });
    expect(r.schema_version).toBe(1);
    expect(r.generated_at).toBe("2026-05-23T14:01:22.000Z");
    expect(r.prompt).toBe("hi");
    expect(r.strategy).toBe("parallel");
    expect(r.models).toEqual([]);
  });

  it("joins selectedModels.size_bytes onto each row by model name", () => {
    const r = buildReport({
      prompt: "p", strategy: "sequential", hardwareSnapshot: null,
      selectedModels: [{ name: "a", size_bytes: 2_000_000_000 }],
      rows: [{ model: "a", modelId: "u", status: "done", output: "ok",
        metrics: { ttft_ms: 10, tokens_per_sec: 30, token_count: 5 },
        error: null, startedAt: "s", endedAt: "e" }],
      now: FIXED,
    });
    expect(r.models[0]).toMatchObject({
      name: "a", size_bytes: 2_000_000_000, output: "ok", status: "done",
      metrics: { ttft_ms: 10, tokens_per_sec: 30, token_count: 5 },
      started_at: "s", ended_at: "e", error: null,
    });
  });

  it("size_bytes is null when the row's model isn't in selectedModels (e.g. deselected mid-run)", () => {
    const r = buildReport({
      prompt: "p", strategy: "sequential", hardwareSnapshot: null,
      selectedModels: [],
      rows: [{ model: "a", modelId: null, status: "pending", output: "",
        metrics: null, error: null, startedAt: null, endedAt: null }],
      now: FIXED,
    });
    expect(r.models[0].size_bytes).toBeNull();
  });

  it("preserves row order from the store", () => {
    const r = buildReport({
      prompt: "p", strategy: "sequential", hardwareSnapshot: null,
      selectedModels: [],
      rows: ["c", "a", "b"].map((m) => ({
        model: m, modelId: null, status: "pending" as const, output: "",
        metrics: null, error: null, startedAt: null, endedAt: null,
      })),
      now: FIXED,
    });
    expect(r.models.map((m) => m.name)).toEqual(["c", "a", "b"]);
  });
});
