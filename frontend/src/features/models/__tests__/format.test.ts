import { describe, it, expect } from "vitest";
import { hfVariantModelName } from "../format";

describe("hfVariantModelName", () => {
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

  it("rewrites a subdirectory path's slash into a dash so the name passes validate_name", () => {
    expect(hfVariantModelName("bert-bge-small/ggml-model-f16-big-endian.gguf", "F16"))
      .toBe("bert-bge-small-ggml-model-f16-big-endian:f16");
  });

  it("sanitizes other illegal chars (backslash, whitespace, quotes) into dashes", () => {
    expect(hfVariantModelName("weird name with\\backslash.gguf"))
      .toBe("weird-name-with-backslash");
  });
});
