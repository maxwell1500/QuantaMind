import { describe, it, expect, beforeEach } from "vitest";
import { useWorkspaceStore } from "../workspaceStore";

beforeEach(() => {
  useWorkspaceStore.setState({ status: "idle" });
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
});
