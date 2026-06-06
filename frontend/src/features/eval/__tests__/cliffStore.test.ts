import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../shared/ipc/eval/toolcall", () => ({ runToolcallEval: vi.fn() }));
vi.mock("../../../shared/ipc/eval/cliff", () => ({ saveCliffResult: vi.fn(), getCliffResults: vi.fn() }));

import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import { saveCliffResult, getCliffResults } from "../../../shared/ipc/eval/cliff";
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
  ...over,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  useCliffStore.getState().reset();
  useCliffStore.setState({ results: {}, request: null, probed: {}, brokenBaseline: {} });
});

describe("cliffStore", () => {
  it("runs the ladder, persists the computed cliff, and updates results with the verbatim model key", async () => {
    let n = 0;
    const series = [
      { composite: 1.0, prompt_tokens: 1000 },
      { composite: 1.0, prompt_tokens: 4000 },
      { composite: 0.5, prompt_tokens: 8000 }, // 0.5 drops ≥0.2 below the 1.0 baseline → cliff here
    ];
    vi.mocked(runToolcallEval).mockImplementation(async () => series[n++] as never);
    vi.mocked(saveCliffResult).mockResolvedValue(undefined);

    await useCliffStore.getState().runProbe(args());

    const s = useCliffStore.getState();
    expect(s.points).toHaveLength(3);
    expect(s.running).toBe(false);
    expect(s.progress).toEqual({ done: 3, total: 3 });
    expect(saveCliffResult).toHaveBeenCalledWith("finance", "qwen2.5-coder:7b", 8000);
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBe(8000); // colon key preserved
  });

  it("resets the series before a re-run — never appends to the old run (guardrail 2)", async () => {
    vi.mocked(runToolcallEval).mockResolvedValue({ composite: 1.0, prompt_tokens: 1000 } as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().points).toHaveLength(2);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().points).toHaveLength(2); // 2, not 4 — cleared first
  });

  it("marks (collection, model) probed even when NO cliff is found — without persisting a value", async () => {
    // Accuracy never collapses → cliffPoint is null → no save, but it WAS probed.
    vi.mocked(runToolcallEval).mockResolvedValue({ composite: 1.0, prompt_tokens: 1000 } as never);
    await useCliffStore.getState().runProbe(args({ steps: 3 }));
    expect(useCliffStore.getState().wasProbed("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(useCliffStore.getState().hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(false);
    expect(saveCliffResult).not.toHaveBeenCalled(); // no cliff → nothing persisted
    expect(useCliffStore.getState().cliffFor("finance", "qwen2.5-coder:7b")).toBeNull();
  });

  it("flags a broken baseline (every rung at 0%) instead of falsely reporting '✓ no cliff'", async () => {
    // The reported bug: 0% at the unpadded baseline → the model is broken from the
    // start, NOT a healthy plateau. Probed=true, brokenBaseline=true, nothing persisted.
    vi.mocked(runToolcallEval).mockResolvedValue({ composite: 0.0, prompt_tokens: 388 } as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    const s = useCliffStore.getState();
    expect(s.wasProbed("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(s.hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(true);
    expect(saveCliffResult).not.toHaveBeenCalled();
    expect(s.cliffFor("finance", "qwen2.5-coder:7b")).toBeNull();
  });

  it("a healthy re-run clears a stale broken-baseline flag", async () => {
    vi.mocked(runToolcallEval).mockResolvedValue({ composite: 0.0, prompt_tokens: 388 } as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(true);
    vi.mocked(runToolcallEval).mockResolvedValue({ composite: 1.0, prompt_tokens: 388 } as never);
    await useCliffStore.getState().runProbe(args({ steps: 2 }));
    expect(useCliffStore.getState().hasBrokenBaseline("finance", "qwen2.5-coder:7b")).toBe(false);
  });

  it("stop halts an in-flight run before it persists", async () => {
    let n = 0;
    let resolveRung2: (v: unknown) => void = () => {};
    vi.mocked(runToolcallEval).mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve({ composite: 1.0, prompt_tokens: 1000 } as never);
      return new Promise((r) => (resolveRung2 = r)) as never; // rung 2 hangs
    });
    const p = useCliffStore.getState().runProbe(args({ steps: 3 }));
    await flush(); // rung 1 done, rung 2 awaiting
    useCliffStore.getState().stop();
    expect(useCliffStore.getState().running).toBe(false);
    resolveRung2({ composite: 0.5, prompt_tokens: 8000 }); // resolves AFTER stop
    await p;
    expect(saveCliffResult).not.toHaveBeenCalled(); // cancelled → never persisted
  });

  it("setRequest / consumeRequest is one-shot (pre-fill carried once)", () => {
    useCliffStore.getState().setRequest({ model: "m", backend: "ollama", collectionId: "c", maxTokens: 8000, steps: 5 });
    expect(useCliffStore.getState().consumeRequest()?.model).toBe("m");
    expect(useCliffStore.getState().request).toBeNull();
    expect(useCliffStore.getState().consumeRequest()).toBeNull();
  });

  it("hydrate loads backend results with verbatim colon keys", async () => {
    vi.mocked(getCliffResults).mockResolvedValue({ "qwen2.5-coder:7b": 12000 });
    await useCliffStore.getState().hydrate("finance");
    expect(useCliffStore.getState().cliffFor("finance", "qwen2.5-coder:7b")).toBe(12000);
  });

  it("cliffForModel returns the DEEPEST cliff across all collections (Inspector has no collection)", () => {
    useCliffStore.setState({ results: { finance: { "m:1b": 6000 }, ops: { "m:1b": 9000 }, misc: { other: 1 } } });
    expect(useCliffStore.getState().cliffForModel("m:1b")).toBe(9000); // max(6000, 9000)
    expect(useCliffStore.getState().cliffForModel("never-probed")).toBeNull();
  });
});
