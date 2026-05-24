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

  it("setRowDone records metrics and sets endedAt", () => {
    useCompareStore.getState().initRun([M("a")]);
    useCompareStore.getState().setRowDone({
      model: "a", ttft_ms: 42, tokens_per_sec: 38.2, token_count: 218,
    });
    const row = useCompareStore.getState().rows[0];
    expect(row.status).toBe("done");
    expect(row.metrics).toEqual({ ttft_ms: 42, tokens_per_sec: 38.2, token_count: 218 });
    expect(row.endedAt).toBeTypeOf("string");
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
