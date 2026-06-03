import { describe, it, expect } from "vitest";
import { groupQuantVariants } from "../quantPick";
import { recommendQuant, quantRank } from "../recommend";
import type { InstalledModelInfo } from "../../../shared/ipc/models/storage";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";

const GB = 1024 ** 3;
const model = (quant: string, gb: number): InstalledModelInfo => ({
  name: `llama-7b-${quant}`, size_bytes: gb * GB, modified_at: "",
  family: "Llama", parameter_size: "7B", quantization: quant, backend: "llama_cpp",
});
const hw = (avail: number): HardwareSnapshot => ({
  total_memory_bytes: avail, available_memory_bytes: avail, is_apple_silicon: true,
});

describe("groupQuantVariants", () => {
  it("groups same family+size and skips models without quant metadata", () => {
    const groups = groupQuantVariants([
      model("Q4_K_M", 4), model("Q8_0", 8),
      { ...model("Q5_K_M", 5), family: "" }, // missing family → skipped
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("Llama 7B");
    expect(groups[0].variants.map((v) => v.quantization)).toEqual(["Q4_K_M", "Q8_0"]); // size-sorted
  });

  it("dedupes the same quant installed under two backends (no double rows)", () => {
    const groups = groupQuantVariants([
      model("Q2_K", 1), // e.g. llama.cpp GGUF
      { ...model("Q2_K", 1), name: "llama-7b:q2_k", backend: "ollama" }, // same quant via Ollama
      model("Q3_K_L", 1.4),
      { ...model("Q3_K_L", 1.4), name: "llama-7b:q3_k_l", backend: "ollama" },
    ]);
    expect(groups[0].variants.map((v) => v.quantization)).toEqual(["Q2_K", "Q3_K_L"]); // 2, not 4
  });
});

describe("recommendQuant", () => {
  const variants = groupQuantVariants([model("Q4_K_M", 4), model("Q5_K_M", 5), model("Q8_0", 8)])[0].variants;

  it("quality use-cases pick the highest-quality quant that fits", () => {
    const r = recommendQuant("quality-writing", hw(16 * GB), variants);
    expect(r.pick?.quantization).toBe("Q8_0");
    expect(r.why).toContain("highest-quality");
  });

  it("fast-chat picks the smallest (fastest) fitting quant", () => {
    expect(recommendQuant("fast-chat", hw(16 * GB), variants).pick?.quantization).toBe("Q4_K_M");
  });

  it("won't recommend a quant that doesn't fit", () => {
    const r = recommendQuant("coding", hw(3 * GB), variants); // even Q4 (4GB×1.3) won't fit
    expect(r.pick).toBeNull();
    expect(r.why).toContain("try a smaller model");
  });

  it("quantRank orders families low→high bits", () => {
    expect(quantRank("Q8_0")).toBeGreaterThan(quantRank("Q4_K_M"));
    expect(quantRank("Q4_K_M")).toBeGreaterThan(quantRank("Q2_K"));
  });
});
