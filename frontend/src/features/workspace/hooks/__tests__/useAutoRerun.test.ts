import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRerun, AUTO_RERUN_MS } from "../useAutoRerun";
import type { RunStatus } from "../useStreamingRun";

type Args = Parameters<typeof useAutoRerun>[0];

const base: Args = {
  enabled: true,
  selectionId: "/ws/a.yaml",
  runKey: "k0",
  status: "idle" as RunStatus,
  canRun: true,
  onFire: () => {},
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutoRerun", () => {
  it("fires once 800ms after an edit, not before", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire } });
    rerender({ ...base, onFire, runKey: "k1" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS - 50); });
    expect(onFire).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(60); });
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("debounces rapid edits into a single fire", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire } });
    rerender({ ...base, onFire, runKey: "k1" });
    act(() => { vi.advanceTimersByTime(400); });
    rerender({ ...base, onFire, runKey: "k2" });
    act(() => { vi.advanceTimersByTime(400); });
    rerender({ ...base, onFire, runKey: "k3" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS + 10); });
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("does not fire on prompt selection change", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire } });
    rerender({ ...base, onFire, selectionId: "/ws/b.yaml", runKey: "different" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS + 10); });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("does not fire while a run is in progress", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire, status: "running" } });
    rerender({ ...base, onFire, status: "running", runKey: "k1" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS + 10); });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("re-fires once after a run completes if edited mid-run", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire, status: "running" } });
    rerender({ ...base, onFire, status: "running", runKey: "k1" });
    rerender({ ...base, onFire, status: "done", runKey: "k1" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS + 10); });
    expect(onFire).toHaveBeenCalledOnce();
  });

  it("toggling off cancels a pending fire", () => {
    const onFire = vi.fn();
    const { rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: { ...base, onFire } });
    rerender({ ...base, onFire, runKey: "k1" });
    act(() => { vi.advanceTimersByTime(300); });
    rerender({ ...base, onFire, enabled: false, runKey: "k1" });
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS); });
    expect(onFire).not.toHaveBeenCalled();
  });

  it("reports pending=true during the debounce window", () => {
    const { result, rerender } = renderHook((p: Args) => useAutoRerun(p), { initialProps: base });
    rerender({ ...base, runKey: "k1" });
    expect(result.current.pending).toBe(true);
    act(() => { vi.advanceTimersByTime(AUTO_RERUN_MS + 10); });
    expect(result.current.pending).toBe(false);
  });
});
