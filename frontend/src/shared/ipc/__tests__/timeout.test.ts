import { describe, it, expect, vi } from "vitest";
import { TimeoutError, withTimeout } from "../core/timeout";

describe("withTimeout (F7)", () => {
  it("rejects with TimeoutError exactly after the given ms", async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise<string>(() => {});
    const wrapped = withTimeout(neverResolves, 30_000, "run_prompt");
    const caught = wrapped.catch((e) => e);

    vi.advanceTimersByTime(29_999);
    // still pending — flush microtasks to be sure nothing rejected early
    await Promise.resolve();

    vi.advanceTimersByTime(2);

    const err = await caught;
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).message).toBe(
      "run_prompt timed out after 30000ms",
    );
    vi.useRealTimers();
  });

  it("resolves with the inner value if it completes before timeout", async () => {
    const fast = Promise.resolve("hello");
    const result = await withTimeout(fast, 30_000, "fast");
    expect(result).toBe("hello");
  });

  it("propagates the inner rejection unchanged (not a TimeoutError)", async () => {
    const failing = Promise.reject(new Error("inner fail"));
    const err = await withTimeout(failing, 30_000, "x").catch((e) => e);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect((err as Error).message).toBe("inner fail");
  });

  it("clears the timer when the inner promise wins (no orphan reject)", async () => {
    vi.useFakeTimers();
    const fast = Promise.resolve("ok");
    const wrapped = withTimeout(fast, 30_000, "x");
    const result = await wrapped;
    expect(result).toBe("ok");
    // Advance past the timeout — should NOT cause an unhandled rejection.
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    vi.useRealTimers();
  });
});
