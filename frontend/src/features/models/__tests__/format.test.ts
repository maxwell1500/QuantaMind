import { describe, it, expect } from "vitest";
import { formatBytes, formatDuration, hfVariantModelName } from "../format";

describe("hfVariantModelName (M.5)", () => {
  it("returns lowercase base without tag when no quantization given", () => {
    expect(hfVariantModelName("Foo-Bar.gguf")).toBe("foo-bar");
  });
  it("encodes <base>:<quant> and strips a trailing -<quant> from the base", () => {
    expect(hfVariantModelName("Llama-3.2-1B-Instruct-Q4_K_M.gguf", "Q4_K_M"))
      .toBe("llama-3.2-1b-instruct:q4_k_m");
  });
  it("strips a trailing .<quant> from the base", () => {
    expect(hfVariantModelName("CodeLlama-7b-Instruct-hf.Q4_K_M.gguf", "Q4_K_M"))
      .toBe("codellama-7b-instruct-hf:q4_k_m");
  });
  it("leaves the base alone if no trailing quant is found", () => {
    expect(hfVariantModelName("gemma-2-9b-it.gguf", "Q4_K_M"))
      .toBe("gemma-2-9b-it:q4_k_m");
  });
});

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
