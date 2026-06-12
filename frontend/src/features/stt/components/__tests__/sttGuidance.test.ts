import { describe, it, expect } from "vitest";
import { sttGuidance, lastLines } from "../SttError";

describe("sttGuidance", () => {
  // Feed the actual backend note/error strings so the UI guidance stays aligned
  // with what the commands return.
  const cases: Array<[string, string]> = [
    [
      "whisper.cpp (whisper-server) isn't installed. Install it with `brew install whisper-cpp`, then Re-check.",
      "whisper.cpp isn't installed",
    ],
    [
      "dyld: Library not loaded: @rpath/libwhisper.1.dylib",
      "whisper.cpp is installed but can't run",
    ],
    [
      "The silero VAD model is missing: /x/ggml-silero-v6.2.0.bin. Re-run the download — the VAD ships together with the whisper model.",
      "The VAD model is missing",
    ],
    [
      "The whisper model file is missing: /x/ggml-tiny.en.bin. Download it first.",
      "The speech model isn't downloaded",
    ],
    [
      "Something is already using the STT port 8093. Stop it and try again — QuantaMind won't take over a process it didn't start.",
      "Port 8093 is already in use",
    ],
    [
      "Can't reach the local STT server at http://127.0.0.1:8093 — is it running?",
      "The speech-to-text server isn't responding",
    ],
    [
      "file too small to be a real whisper model: 4096 bytes",
      "The model download is incomplete or invalid",
    ],
    [
      "whisper-server started but didn't report a loaded model within 30 seconds.",
      "whisper-server couldn't start",
    ],
  ];

  it.each(cases)("maps %s to its guidance title", (msg, title) => {
    expect(sttGuidance(msg)?.title).toBe(title);
  });

  it("returns null for an unrecognized message (caller shows it raw)", () => {
    expect(sttGuidance("some entirely novel failure")).toBeNull();
  });

  it("orders the broken-engine check ahead of not-installed", () => {
    // A dyld failure must not be mistaken for 'not installed'.
    expect(sttGuidance("Library not loaded while engine present")?.title).toBe(
      "whisper.cpp is installed but can't run",
    );
  });
});

describe("lastLines", () => {
  it("keeps only the last N non-empty lines", () => {
    const text = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const out = lastLines(text, 8);
    expect(out.split("\n")).toHaveLength(8);
    expect(out.split("\n")[7]).toBe("line 19");
    expect(out.split("\n")[0]).toBe("line 12");
  });

  it("drops blank lines from the verbose banner", () => {
    expect(lastLines("a\n\n\nb\n\nc", 8)).toBe("a\nb\nc");
  });
});
