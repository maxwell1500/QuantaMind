import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";

beforeEach(() => {
  useWorkspaceStore.setState({ lastRunMetrics: null });
});

describe("workspaceStore (shared cross-component state only)", () => {
  it("lastRunMetrics starts null", () => {
    expect(useWorkspaceStore.getState().lastRunMetrics).toBeNull();
  });

  it("setLastRunMetrics stores a DonePayload byte-for-byte", () => {
    const payload = { ttft_ms: 120, tokens_per_sec: 47.3, token_count: 47 };
    useWorkspaceStore.getState().setLastRunMetrics(payload);
    expect(useWorkspaceStore.getState().lastRunMetrics).toEqual(payload);
  });

  it("setLastRunMetrics overwrites prior value", () => {
    const a = { ttft_ms: 100, tokens_per_sec: 10, token_count: 1 };
    const b = { ttft_ms: 200, tokens_per_sec: 20, token_count: 2 };
    useWorkspaceStore.getState().setLastRunMetrics(a);
    useWorkspaceStore.getState().setLastRunMetrics(b);
    expect(useWorkspaceStore.getState().lastRunMetrics).toEqual(b);
  });
});
