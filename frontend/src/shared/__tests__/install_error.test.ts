import { describe, it, expect } from "vitest";
import { friendlyInstallError } from "../install_error";

const E = (kind: string, message: string) => ({ kind, message });

describe("friendlyInstallError", () => {
  it("Ollama down → friendly start-Ollama hint", () => {
    expect(friendlyInstallError(E("inference", "error trying to connect: tcp connect error"))).toMatch(/Ollama isn't running/);
    expect(friendlyInstallError(E("io", "Connection refused (os error 61)"))).toMatch(/Ollama isn't running/);
  });

  it("auth required → gated-repo hint", () => {
    expect(friendlyInstallError(E("auth_required", "bartowski/private: HF auth required"))).toMatch(/gated/);
  });

  it("rate limited → wait hint", () => {
    expect(friendlyInstallError(E("inference", "hf search: HF rate limited (HTTP 429)"))).toMatch(/rate-limiting/);
  });

  it("invalid model name → suggest different variant", () => {
    const e = E("inference", 'create HTTP 400 Bad Request: {"error":"invalid model name"}');
    expect(friendlyInstallError(e)).toMatch(/Ollama rejected this model's name/);
  });

  it("manifest unknown → check tag", () => {
    const e = E("inference", "ollama pull: pull model manifest: file does not exist");
    expect(friendlyInstallError(e)).toMatch(/wasn't found.*tag/i);
  });

  it("not_found AppError kind → check tag", () => {
    expect(friendlyInstallError(E("not_found", "model snowflake-arctic-embed:335m"))).toMatch(/wasn't found/);
  });

  it("big-endian GGUF → format/byte-order hint", () => {
    const e = E("inference", "create HTTP 400 Bad Request: bad magic: file looks big-endian");
    expect(friendlyInstallError(e)).toMatch(/big-endian|unsupported format/);
  });

  it("bad magic in body → unsupported-format hint", () => {
    const e = E("inference", 'create HTTP 400: {"error":"unsupported architecture: foo"}');
    expect(friendlyInstallError(e)).toMatch(/unsupported|format/i);
  });

  it("silent-rollback-after-success → friendly rollback explanation", () => {
    const e = E("inference", "Ollama reported success but `tinyllama-1.1b-chat-v1.0:q8_0` is not in /api/tags — registration was silently rolled back");
    expect(friendlyInstallError(e)).toMatch(/silently rolled back|didn't actually register/i);
    expect(friendlyInstallError(e)).toMatch(/server\.log/);
  });

  it("silent-success stream → mmproj / adapter explanation", () => {
    const e = E("inference", "ollama create: stream ended without success (last status: writing manifest)");
    expect(friendlyInstallError(e)).toMatch(/projection.*adapter|mmproj|standalone model/i);
  });

  it("timeout kind → network hint", () => {
    expect(friendlyInstallError(E("timeout", "run_prompt timed out after 30000ms"))).toMatch(/timed out.*network/i);
  });

  it("create HTTP 400 fallback shows Ollama's reason inline", () => {
    const e = E("inference", 'create HTTP 400 Bad Request: {"error":"models field required"}');
    const out = friendlyInstallError(e);
    expect(out).toMatch(/Ollama rejected/);
    expect(out).toMatch(/models field required/);
  });

  it("HF HTTP error surfaces the original message", () => {
    expect(friendlyInstallError(E("inference", "hf search: HF HTTP 502"))).toMatch(/Hugging Face.*502/);
  });

  it("accepts a bare string error", () => {
    expect(friendlyInstallError("network is unreachable")).toContain("network is unreachable");
  });

  it("falls back to a generic message when nothing matches and no message present", () => {
    expect(friendlyInstallError({})).toMatch(/unknown reason/);
    expect(friendlyInstallError(null)).toMatch(/unknown reason/);
  });
});
