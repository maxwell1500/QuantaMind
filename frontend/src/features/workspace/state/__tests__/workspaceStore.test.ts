import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";

beforeEach(() => {
  useWorkspaceStore.setState({ status: "idle", lastRunMetrics: null });
});

describe("workspaceStore state machine", () => {
  it("starts in idle", () => {
    expect(useWorkspaceStore.getState().status).toBe("idle");
  });

  it("transitions idle → running → streaming → done", () => {
    const s = useWorkspaceStore.getState;
    s().beginRun();
    expect(s().status).toBe("running");
    s().receiveToken();
    expect(s().status).toBe("streaming");
    s().finish();
    expect(s().status).toBe("done");
  });

  it("cancel resets to idle from running", () => {
    const s = useWorkspaceStore.getState;
    s().beginRun();
    s().cancel();
    expect(s().status).toBe("idle");
  });

  it("cancel resets to idle from streaming", () => {
    const s = useWorkspaceStore.getState;
    s().beginRun();
    s().receiveToken();
    s().cancel();
    expect(s().status).toBe("idle");
  });

  it("cancel resets to idle from done", () => {
    const s = useWorkspaceStore.getState;
    s().beginRun();
    s().receiveToken();
    s().finish();
    s().cancel();
    expect(s().status).toBe("idle");
  });

  it("receiveToken from idle is a no-op", () => {
    useWorkspaceStore.getState().receiveToken();
    expect(useWorkspaceStore.getState().status).toBe("idle");
  });

  it("receiveToken stays in streaming on subsequent calls", () => {
    const s = useWorkspaceStore.getState;
    s().beginRun();
    s().receiveToken();
    s().receiveToken();
    s().receiveToken();
    expect(s().status).toBe("streaming");
  });

  it("finish from idle is a no-op", () => {
    useWorkspaceStore.getState().finish();
    expect(useWorkspaceStore.getState().status).toBe("idle");
  });

  it("lastRunMetrics starts null and accepts a DonePayload", () => {
    expect(useWorkspaceStore.getState().lastRunMetrics).toBeNull();
    useWorkspaceStore
      .getState()
      .setLastRunMetrics({ ttft_ms: 120, tokens_per_sec: 47.3, token_count: 47 });
    expect(useWorkspaceStore.getState().lastRunMetrics).toEqual({
      ttft_ms: 120,
      tokens_per_sec: 47.3,
      token_count: 47,
    });
  });

  it("metrics persist across a beginRun (stale display until next done)", () => {
    const s = useWorkspaceStore.getState;
    s().setLastRunMetrics({ ttft_ms: 200, tokens_per_sec: 30, token_count: 10 });
    s().beginRun();
    expect(s().lastRunMetrics).toEqual({
      ttft_ms: 200,
      tokens_per_sec: 30,
      token_count: 10,
    });
  });
});
