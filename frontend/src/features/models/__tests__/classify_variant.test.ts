import { describe, it, expect } from "vitest";
import { classifyHfVariant } from "../classify_variant";

describe("classifyHfVariant", () => {
  it.each([
    "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    "Qwen2.5-7B-Instruct-Q5_K_M.gguf",
    "gemma-2-9b-it-Q4_K_M.gguf",
    "Mistral-Small-Instruct-2409-Q4_K_M.gguf",
    "ggml-model-f16-big-endian.gguf",
  ])("classifies %s as a standalone model", (name) => {
    expect(classifyHfVariant(name).kind).toBe("model");
  });

  it.each([
    "mmproj-gemma-4-26b-a4b-it-bf16.gguf",
    "MMProj-Big.gguf",
    "vision-mmproj-q4.gguf",
    "llava-1.6-mmproj.gguf",
  ])("classifies %s as a projection layer", (name) => {
    const c = classifyHfVariant(name);
    expect(c.kind).toBe("projection");
    expect(c.label).toBe("Projection layer");
    expect(c.reason).toMatch(/multimodal|projection/i);
  });

  it.each([
    "qwen2.5-7b-lora-finetune.gguf",
    "model_lora_adapter.gguf",
    "stable-diffusion-lora.gguf",
    "llama-3-adapter.gguf",
  ])("classifies %s as an adapter / LoRA", (name) => {
    const c = classifyHfVariant(name);
    expect(c.kind).toBe("adapter");
    expect(c.label).toMatch(/LoRA|adapter/i);
  });

  it("doesn't falsely match `lora` inside an unrelated word", () => {
    // `florax`, `palorama`, etc. — `lora` is only flagged with word boundaries
    expect(classifyHfVariant("florax-model.gguf").kind).toBe("model");
    expect(classifyHfVariant("palorama-7b.gguf").kind).toBe("model");
  });

  it("is case-insensitive", () => {
    expect(classifyHfVariant("MMPROJ-X.GGUF").kind).toBe("projection");
    expect(classifyHfVariant("Foo-LoRA.gguf").kind).toBe("adapter");
  });
});
