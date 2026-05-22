import { describe, it, expect } from "vitest";
import {
  applyProgress,
  deriveProgress,
  ETA_CAP_SECONDS,
  IDLE,
} from "../install_state";

describe("deriveProgress (M.2)", () => {
  it("computes percentComplete from total/completed", () => {
    expect(deriveProgress({ total: 1000, completed: 250, speed_bps: 100 }).percentComplete).toBe(25);
  });

  it("clamps percentComplete to [0, 100] when completed exceeds total", () => {
    expect(deriveProgress({ total: 100, completed: 200, speed_bps: 50 }).percentComplete).toBe(100);
  });

  it("returns 0% when total is 0 (no divide by zero)", () => {
    expect(deriveProgress({ total: 0, completed: 0, speed_bps: 0 }).percentComplete).toBe(0);
  });

  it("etaSeconds = 0 when speed_bps is 0", () => {
    expect(deriveProgress({ total: 1000, completed: 0, speed_bps: 0 }).etaSeconds).toBe(0);
  });

  it("etaSeconds capped at 99999 for absurd speeds", () => {
    const r = deriveProgress({ total: 1_000_000_000_000, completed: 0, speed_bps: 1 });
    expect(r.etaSeconds).toBe(ETA_CAP_SECONDS);
  });
});

describe("applyProgress (M.2)", () => {
  it("pulling_manifest sets status=pulling, phase=manifest", () => {
    const next = applyProgress(IDLE, { phase: "pulling_manifest" });
    expect(next.status).toBe("pulling");
    expect(next.phase).toBe("manifest");
  });

  it("downloading carries through progress fields", () => {
    const next = applyProgress(IDLE, {
      phase: "downloading",
      digest: "sha256:abc",
      total: 1000,
      completed: 250,
      speed_bps: 500,
    });
    expect(next.phase).toBe("downloading");
    expect(next.progress?.bytesCompleted).toBe(250);
    expect(next.progress?.speedBps).toBe(500);
  });

  it("success transitions to status=success, phase=null", () => {
    const next = applyProgress({ status: "pulling", phase: "writing" }, { phase: "success" });
    expect(next.status).toBe("success");
    expect(next.phase).toBeNull();
  });
});
