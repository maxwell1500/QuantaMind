import { describe, it, expect } from "vitest";
import { backendRunHint } from "../state/runHint";

const h = (ollama: boolean | null, llama: boolean | null, mlx: boolean | null) => ({ ollama, llama, mlx });

describe("backendRunHint (no-fallback block)", () => {
  it("blocks MLX with a start hint until its server is healthy", () => {
    expect(backendRunHint("mlx", h(true, null, false))).toBe("Start the MLX backend to run this model");
    expect(backendRunHint("mlx", h(true, null, null))).toBe("Start the MLX backend to run this model");
    expect(backendRunHint("mlx", h(false, false, true))).toBeNull();
  });

  it("blocks llama.cpp until healthy", () => {
    expect(backendRunHint("llama_cpp", h(true, false, null))).toBe("Start llama.cpp to run this model");
    expect(backendRunHint("llama_cpp", h(false, true, false))).toBeNull();
  });

  it("blocks Ollama only when explicitly unhealthy (null = still checking)", () => {
    expect(backendRunHint("ollama", h(false, null, null))).toBe("Start Ollama first");
    expect(backendRunHint("ollama", h(null, null, null))).toBeNull();
    expect(backendRunHint("ollama", h(true, null, null))).toBeNull();
  });
});
