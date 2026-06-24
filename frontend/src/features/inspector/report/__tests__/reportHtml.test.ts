import { describe, it, expect } from "vitest";
import { buildInspectorHtml } from "../reportHtml";
import type { CompareRow } from "../../../compare/state/compareRow";
import type { HardwareSnapshot } from "../../../../shared/ipc/compare/hardware";

const row: CompareRow = {
  model: "phi3.5:latest", modelId: null, status: "done", output: "x",
  metrics: {
    ttft_ms: 3000, tokens_per_sec: 36, token_count: 3,
    timeline: [{ text: "a", t_ms: 3000, n: 1 }, { text: "b", t_ms: 3020, n: 2 }, { text: "c", t_ms: 3050, n: 3 }],
    stats: { load_ms: 2400, prompt_eval_ms: 540, prompt_eval_count: 183 },
  },
  error: null, startedAt: null, endedAt: null,
};

const hw: HardwareSnapshot = {
  total_memory_bytes: 16 * 1024 ** 3, available_memory_bytes: 8 * 1024 ** 3,
  is_apple_silicon: true, cpu: "Apple M3 Pro", arch: "aarch64",
  gpu: { name: "Apple M3 Pro (integrated)", unified: true, available: true },
};

describe("buildInspectorHtml", () => {
  it("produces a self-contained doc with hardware, the model, and an SVG", () => {
    const html = buildInspectorHtml({
      rows: [row], hardware: hw, vramByName: new Map(), history: [],
      generatedAtIso: "2026-05-30T12:00:00.000Z",
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("QuantaMind Performance Report");
    expect(html).toContain("phi3.5:latest");
    expect(html).toContain("Apple M3 Pro");
    expect(html).toContain("<svg");
    expect(html).toContain("2026-05-30T12:00:00.000Z");
    expect(html).not.toContain("class=\"visx"); // no React/Tailwind runtime artifacts
  });

  it("notes when there are no charted runs", () => {
    const html = buildInspectorHtml({
      rows: [], hardware: null, vramByName: new Map(), history: [], generatedAtIso: "t",
    });
    expect(html).toContain("No runs to report");
  });
});
