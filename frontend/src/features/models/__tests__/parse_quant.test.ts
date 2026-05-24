import { describe, it, expect } from "vitest";
import { parseQuant } from "../parse_quant";

describe("parseQuant", () => {
  it.each([
    ["Llama-3.2-1B-Instruct-Q4_K_M.gguf", "Q4_K_M"],
    ["CodeLlama-7b-Instruct-hf.Q4_K_M.gguf", "Q4_K_M"],
    ["model-IQ4_XS.gguf", "IQ4_XS"],
    ["model.IQ2_XXS.gguf", "IQ2_XXS"],
    ["model-bf16.gguf", "BF16"],
    ["MODEL-F16.GGUF", "F16"],
    ["model-q3_k_l.gguf", "Q3_K_L"],
    ["Qwen2.5-7B-Instruct-Q5_K_M.gguf", "Q5_K_M"],
    ["foo-Q8_0.gguf", "Q8_0"],
  ])("extracts the quant from %s", (filename, expected) => {
    expect(parseQuant(filename)).toBe(expected);
  });

  it("returns null when no known quant suffix is present", () => {
    expect(parseQuant("model.gguf")).toBeNull();
    expect(parseQuant("random-file-name.gguf")).toBeNull();
  });

  it("prefers the longer canonical match (IQ2_XS over IQ2_S)", () => {
    expect(parseQuant("foo-IQ2_XS.gguf")).toBe("IQ2_XS");
    expect(parseQuant("foo-IQ2_S.gguf")).toBe("IQ2_S");
  });

  it("requires a separator on both sides — no partial-token match", () => {
    expect(parseQuant("modelQ4_K_M.gguf")).toBeNull();
    expect(parseQuant("Q4_K_Mextra.gguf")).toBeNull();
  });
});
