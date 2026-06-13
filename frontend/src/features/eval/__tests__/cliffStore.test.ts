import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../shared/ipc/eval/cliff", () => ({
  runContextCliff: vi.fn(),
  getCliffResults: vi.fn(),
  EVENT_CLIFF_PROGRESS: "cliff-progress",
}));

import { runContextCliff, getCliffResults } from "../../../shared/ipc/eval/cliff";
import { useCliffStore } from "../state/cliffStore";
import type { RunProbeArgs } from "../state/cliffStore";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const task: ToolTask = { id: "t", category: "single", prompt: "p", tools: [], expected: { type: "call", name: "x", args: {} } };
const args = (over: Partial<RunProbeArgs> = {}): RunProbeArgs => ({
  model: "qwen2.5-coder:7b",
  backend: "ollama",
  collectionId: "finance",
  tasks: [task],
  maxTokens: 8000,
  steps: 3,
  source: { kind: "preset", preset: "corporate_policy" },
  ...over,
});

// Backend CliffPoint / CliffReport shapes.
const rung = (verified_tokens: number, composite: number | null) => ({
  target_tokens: verified_tokens, verified_tokens, composite, per_depth: [],
});
type Status = { status: "Collapsed"; depth: number } | { status: "NoCliff"; tested: number } | { status: "Broken"; tested: number };
const reportOf = (status: Status, cliff_tokens: number | null, points: ReturnType<typeof rung>[]) => ({ points, status, cliff_tokens });

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  useCliffStore.getState().reset();
  useCliffStore.setState({ results: {}, request: null, probed: {}, brokenBaseline: {} });
});

describe("cliffStore", () => {
  it("runs the backend probe and updates results from the classified status (verbatim model key)", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "Collapsed", depth: 8000 }, 4000, [rung(1000, 1.0), rung(4000, 1.0), rung(8000, 0.5)]) as never,
    );

    await useCliffStore.getState().runProbe(args());

    const s = useCliffStore.getState();
    expect(s.points).toHaveLength(3);
    expect(s.running).toBe(false);
    // The backend builds the ladder + pads + classifies; the store just forwards.
    const call = vi.mocked(runContextCliff).mock.calls[0];
    expect(call[0]).toBe("qwen2.5-coder:7b"); // model
    expect(call[1]).toBe("ollama"); // backend
    expect(call[2]).toBe("finance"); // collectionId
    expect(call[4]).toEqual({ kind: "preset", preset: "corporate_policy" }); // source
    expect(call[5]).toBe(8000); // maxTokens
    expect(call[6]).toBe(3); // steps
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBe(8000); // collapse depth, colon key preserved
  });

  it("resets the series before a re-run — never appends to the old run (guardrail 2)", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "NoCliff", tested: 1000 }, 1000, [rung(1000, 1.0), rung(1000, 1.0)]) as never,
    );
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().points).toHaveLength(2);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().points).toHaveLength(2); // 2, not 4 — cleared first
  });

  it("marks a NO-cliff result probed but carries no collapse depth", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "NoCliff", tested: 1000 }, 1000, [rung(1000, 1.0), rung(1000, 1.0), rung(1000, 1.0)]) as never,
    );
    await useCliffStore.getState().runProbe(args({ steps: 3 }));
    const s = useCliffStore.getState();
    expect(s.wasProbed("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(s.hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(false);
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBeNull(); // no collapse depth
  });

  it("flags a broken baseline and keeps it OUT of the results depth map", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(
      reportOf({ status: "Broken", tested: 388 }, null, [rung(388, 0.0), rung(388, 0.0)]) as never,
    );
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    const s = useCliffStore.getState();
    expect(s.wasProbed("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(s.hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBeNull(); // never a misleading depth
  });

  it("a healthy re-run clears a stale broken-baseline flag", async () => {
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "Broken", tested: 388 }, null, [rung(388, 0.0)]) as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(true);
    vi.mocked(runContextCliff).mockResolvedValue(reportOf({ status: "NoCliff", tested: 4000 }, 4000, [rung(4000, 1.0)]) as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(false);
  });

  it("stop halts an in-flight run before it writes any state", async () => {
    let resolveRun: (v: unknown) => void = () => {};
    vi.mocked(runContextCliff).mockImplementation(() => new Promise((r) => (resolveRun = r)) as never);
    const p = useCliffStore.getState().runProbe(args({ steps: 3 }));
    await flush(); // probe in flight
    useCliffStore.getState().stop();
    expect(useCliffStore.getState().running).toBe(false);
    resolveRun(reportOf({ status: "Collapsed", depth: 8000 }, 4000, [rung(8000, 0.5)])); // resolves AFTER stop
    await p;
    // Superseded run must not write results/probed.
    expect(useCliffStore.getState().cliffFor("finance", "qwen2.5-coder:7b")).toBeNull();
    expect(useCliffStore.getState().wasProbed("finance", "qwen2.5-coder:7b")).toBe(false);
  });

  it("surfaces a backend error instead of a silent blank chart", async () => {
    vi.mocked(runContextCliff).mockRejectedValue(new Error("server down"));
    await useCliffStore.getState().runProbe(args());
    expect(useCliffStore.getState().error).toMatch(/server down/);
    expect(useCliffStore.getState().running).toBe(false);
  });

  it("setRequest / consumeRequest is one-shot (pre-fill carried once)", () => {
    useCliffStore.getState().setRequest({ model: "m", backend: "ollama", collectionId: "c", maxTokens: 8000, steps: 5 });
    expect(useCliffStore.getState().consumeRequest()?.model).toBe("m");
    expect(useCliffStore.getState().request).toBeNull();
    expect(useCliffStore.getState().consumeRequest()).toBeNull();
  });

  it("hydrate restores every cliff state (depth/no-cliff/broken) across a reload", async () => {
    vi.mocked(getCliffResults).mockResolvedValue({
      "qwen2.5-coder:7b": { status: "Collapsed", depth: 12000 }, // verbatim colon key
      "held:7b": { status: "NoCliff", tested: 4000 },
      "broke:7b": { status: "Broken", tested: 388 },
    });
    await useCliffStore.getState().hydrate("finance");
    const s = useCliffStore.getState();
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBe(12000); // collapse depth in results
    expect(s.cliffFor("finance", "held:7b")).toBeNull(); // no-cliff has no depth
    expect(s.wasProbed("finance", "held:7b")).toBe(true); // ...but it survives as "probed"
    expect(s.wasProbed("finance", "broke:7b")).toBe(true);
    expect(s.hasBrokenBaseline("finance", "broke:7b")).toBe(true); // broken survives the reload
  });

  it("cliffForModel returns the DEEPEST cliff across all collections (Inspector has no collection)", () => {
    useCliffStore.setState({ results: { finance: { "m:1b": 6000 }, ops: { "m:1b": 9000 }, misc: { other: 1 } } });
    expect(useCliffStore.getState().cliffForModel("m:1b")).toBe(9000); // max(6000, 9000)
    expect(useCliffStore.getState().cliffForModel("never-probed")).toBeNull();
  });
});
