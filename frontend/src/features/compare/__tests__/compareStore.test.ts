import { describe, it, expect, beforeEach } from "vitest";
import { useCompareStore } from "../state/compareStore";

const M = (name: string, gb = 2): { name: string; size_bytes: number } => ({
  name, size_bytes: gb * 1024 ** 3,
});

beforeEach(() => useCompareStore.getState().reset());

describe("compareStore reducer", () => {
  it("initRun seeds one pending row per model and marks isRunning", () => {
    useCompareStore.getState().initRun([M("a"), M("b")]);
    const s = useCompareStore.getState();
    expect(s.isRunning).toBe(true);
    expect(s.rows.map((r) => ({ model: r.model, status: r.status })))
      .toEqual([{ model: "a", status: "pending" }, { model: "b", status: "pending" }]);
  });

  it("setSingleRun replaces rows with the one bridged run row", () => {
    useCompareStore.getState().initRun([M("a"), M("b")]); // a prior multi run
    useCompareStore.getState().setSingleRun({
      model: "solo", modelId: null, status: "running", output: "hi",
      metrics: null, error: null, startedAt: null, endedAt: null,
    });
    const s = useCompareStore.getState();
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ model: "solo", status: "running", output: "hi" });
    expect(s.isRunning).toBe(true);
  });

  it("appendToken transitions a pending row to running and accumulates output", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().appendToken("a", "uuid-1", "hi ");
    useCompareStore.getState().appendToken("a", "uuid-1", "there");
    const row = useCompareStore.getState().rows[0];
    expect(row.status).toBe("running");
    expect(row.output).toBe("hi there");
    expect(row.modelId).toBe("uuid-1");
    expect(row.startedAt).toBeTypeOf("string");
  });

  it("setRowDone records metrics (incl. timeline) and sets endedAt", () => {
    useCompareStore.getState().initRun([M("a")]);
    const timeline = [{ text: "hi", t_ms: 12, n: 1 }];
    useCompareStore.getState().setRowDone({
      model: "a", ttft_ms: 42, tokens_per_sec: 38.2, token_count: 1, timeline,
    });
    const row = useCompareStore.getState().rows[0];
    expect(row.status).toBe("done");
    expect(row.metrics).toEqual({ ttft_ms: 42, tokens_per_sec: 38.2, token_count: 1, timeline });
    expect(row.endedAt).toBeTypeOf("string");
  });

  it("setRowDone defaults timeline to [] when omitted", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().setRowDone({ model: "a", ttft_ms: 1, tokens_per_sec: 10, token_count: 0 });
    expect(useCompareStore.getState().rows[0].metrics?.timeline).toEqual([]);
  });

  it("setRowError stores kind + message and ends the row", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().setRowError({ model: "a", kind: "inference", message: "HTTP 500" });
    const row = useCompareStore.getState().rows[0];
    expect(row.status).toBe("error");
    expect(row.error).toEqual({ kind: "inference", message: "HTTP 500" });
  });

  it("finishRun flips any pending rows to cancelled and clears isRunning", () => {
    useCompareStore.getState().initRun([M("a"), M("b")]);
    useCompareStore.getState().setRowDone({ model: "a", ttft_ms: 1, tokens_per_sec: 10, token_count: 1 });
    useCompareStore.getState().finishRun();
    const s = useCompareStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.rows.find((r) => r.model === "a")?.status).toBe("done");
    expect(s.rows.find((r) => r.model === "b")?.status).toBe("cancelled");
  });

  it("reset clears everything", () => {
    useCompareStore.getState().setSelectedModels([M("a")]);
    useCompareStore.getState().setPrompt("hi");
    useCompareStore.getState().setSystemPrompt("you are concise");
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().reset();
    const s = useCompareStore.getState();
    expect(s.selectedModels).toEqual([]);
    expect(s.prompt).toBe("");
    expect(s.systemPrompt).toBe("");
    expect(s.rows).toEqual([]);
    expect(s.isRunning).toBe(false);
  });

  it("systemPrompt defaults to empty and round-trips via setSystemPrompt", () => {
    expect(useCompareStore.getState().systemPrompt).toBe("");
    useCompareStore.getState().setSystemPrompt("be terse");
    expect(useCompareStore.getState().systemPrompt).toBe("be terse");
  });
});

describe("compareStore loading transitions", () => {
  it("setRowLoading transitions pending → loading and assigns modelId", () => {
    useCompareStore.getState().initRun([M("a"), M("b")]);
    useCompareStore.getState().setRowLoading("a", "uuid-a");
    const rows = useCompareStore.getState().rows;
    expect(rows.find((r) => r.model === "a")).toMatchObject({
      status: "loading", modelId: "uuid-a", output: "",
    });
    expect(rows.find((r) => r.model === "b")).toMatchObject({
      status: "pending", modelId: null,
    });
  });

  it("appendToken after setRowLoading transitions loading → running", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().setRowLoading("a", "uuid-a");
    useCompareStore.getState().appendToken("a", "uuid-a", "first ");
    expect(useCompareStore.getState().rows[0]).toMatchObject({
      status: "running", output: "first ", modelId: "uuid-a",
    });
  });

  it("setRowLoading is a no-op on a row that already moved past pending", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().appendToken("a", "uuid-a", "tok");
    useCompareStore.getState().setRowLoading("a", "uuid-a");
    expect(useCompareStore.getState().rows[0].status).toBe("running");
  });
});
