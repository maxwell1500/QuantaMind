import { describe, it, expect } from "vitest";
import { formatIpcError } from "../error";

describe("formatIpcError", () => {
  it("returns Error.message for Error instances", () => {
    expect(formatIpcError(new Error("boom"))).toBe("boom");
  });

  it("returns string primitives as-is", () => {
    expect(formatIpcError("plain")).toBe("plain");
  });

  it("extracts .message from Tauri AppError objects", () => {
    const e = { kind: "validation", message: "GGUF truncated: need 7 bytes" };
    expect(formatIpcError(e)).toBe("GGUF truncated: need 7 bytes");
  });

  it("JSON-stringifies unknown shapes instead of [object Object]", () => {
    expect(formatIpcError({ foo: "bar" })).toBe('{"foo":"bar"}');
  });

  it("falls back to String() for non-serializable values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatIpcError(circular)).toBe("[object Object]");
  });
});
