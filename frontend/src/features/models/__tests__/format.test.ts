import { describe, it, expect } from "vitest";
import { formatBytes, formatDuration } from "../format";

describe("formatBytes (M.2)", () => {
  it.each([
    [0, "0B"],
    [999, "999B"],
    [1024, "1.0KB"],
    [1_048_576, "1.0MB"],
    [1_073_741_824, "1.0GB"],
    [1_400_000_000, "1.3GB"],
    [850 * 1024 * 1024, "850.0MB"],
  ])("formats %s as %s", (n, expected) => {
    expect(formatBytes(n)).toBe(expected);
  });
});

describe("formatDuration (M.2)", () => {
  it.each([
    [0, "0s"],
    [45, "45s"],
    [59, "59s"],
    [60, "1m"],
    [204, "3m 24s"],
    [3600, "1h"],
    [3900, "1h 5m"],
  ])("formats %s seconds as %s", (n, expected) => {
    expect(formatDuration(n)).toBe(expected);
  });

  it("rounds down fractional seconds", () => {
    expect(formatDuration(44.9)).toBe("44s");
  });
});
