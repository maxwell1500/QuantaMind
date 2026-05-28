import { describe, it, expect } from "vitest";
import { assessStrategies } from "../state/strategy";

const HW = (availableGB: number, totalGB = 32) => ({
  total_memory_bytes: Math.round(totalGB * 1024 ** 3),
  available_memory_bytes: Math.round(availableGB * 1024 ** 3),
  is_apple_silicon: true,
});
const M = (gb: number) => ({ size_bytes: Math.round(gb * 1024 ** 3) });

describe("assessStrategies", () => {
  it("returns null when no models are selected", () => {
    expect(assessStrategies([], HW(16))).toBeNull();
  });

  it("returns null when there is no snapshot yet", () => {
    expect(assessStrategies([M(2)], null)).toBeNull();
  });

  it("single small model: both strategies ok", () => {
    const m = assessStrategies([M(2)], HW(16));
    expect(m?.sequential.status).toBe("ok");
    expect(m?.parallel.status).toBe("ok");
  });

  it("oversize single model: both wont_fit", () => {
    const m = assessStrategies([M(20)], HW(16));
    expect(m?.sequential.status).toBe("wont_fit");
    expect(m?.parallel.status).toBe("wont_fit");
  });

  it("sum > avail but max < avail: sequential ok, parallel wont_fit", () => {
    const m = assessStrategies([M(7), M(7), M(7)], HW(16));
    expect(m?.sequential.status).not.toBe("wont_fit");
    expect(m?.parallel.status).toBe("wont_fit");
  });

  it("70% risky threshold: 7GB × 1.3 = 9.1 against 10 free is risky", () => {
    const m = assessStrategies([M(7)], HW(10));
    expect(m?.sequential.status).toBe("risky");
  });

  it("just below 70%: 5GB × 1.3 = 6.5 against 10 free is ok", () => {
    const m = assessStrategies([M(5)], HW(10));
    expect(m?.sequential.status).toBe("ok");
  });

  it("required_bytes uses the 1.3× safety multiplier", () => {
    const m = assessStrategies([M(4)], HW(16));
    const expected = Math.ceil(4 * 1024 ** 3 * 1.3);
    expect(m?.sequential.required_bytes).toBe(expected);
  });

  it("zero-available memory blocks any non-zero requirement", () => {
    const m = assessStrategies([M(1)], { ...HW(0), available_memory_bytes: 0 });
    expect(m?.sequential.status).toBe("wont_fit");
    expect(m?.parallel.status).toBe("wont_fit");
  });
});
