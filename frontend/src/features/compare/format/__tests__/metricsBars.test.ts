import { describe, it, expect } from "vitest";
import { barRows } from "../metricsBars";
import { newRow } from "../../state/compareRow";

const done = (model: string, tps: number | null, ttft: number | null) => ({
  ...newRow(model),
  status: "done" as const,
  metrics: { ttft_ms: ttft, tokens_per_sec: tps, token_count: 1 },
});

describe("barRows", () => {
  it("normalizes by the max and skips rows missing the metric", () => {
    const rows = [done("a", 40, 100), done("b", 20, null), done("c", null, 50)];
    const tps = barRows(rows, "tokens_per_sec");
    expect(tps.map((b) => b.model)).toEqual(["a", "b"]); // c has no tok/s
    expect(tps.find((b) => b.model === "a")?.fraction).toBe(1);
    expect(tps.find((b) => b.model === "b")?.fraction).toBe(0.5);
  });

  it("ignores rows that aren't done", () => {
    const rows = [{ ...newRow("p"), status: "running" as const }, done("d", 10, 5)];
    expect(barRows(rows, "tokens_per_sec").map((b) => b.model)).toEqual(["d"]);
  });
});
