import { describe, it, expect } from "vitest";
import { groupInstalled } from "../installedGroups";

const m = (name: string, backend: "ollama" | "llama_cpp", path?: string) => ({
  name, size_bytes: 1, modified_at: "", family: "x", parameter_size: "1B",
  quantization: "Q4", backend, path,
});

describe("groupInstalled", () => {
  it("merges an Ollama `:latest` tag with its bare llama.cpp folder name", () => {
    const groups = groupInstalled([
      m("phi-4-mini:latest", "ollama"),
      m("phi-4-mini", "llama_cpp", "/g/phi-4-mini.gguf"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: "phi-4-mini",
      ollamaName: "phi-4-mini:latest",
      llamaPath: "/g/phi-4-mini.gguf",
    });
  });

  it("keeps a folder-only model as llama.cpp with no Ollama tag", () => {
    const [g] = groupInstalled([m("solo", "llama_cpp", "/g/solo.gguf")]);
    expect(g.ollamaName).toBeUndefined();
    expect(g.llamaPath).toBe("/g/solo.gguf");
  });

  it("does not collapse distinct Ollama tags like mistral:7b", () => {
    const groups = groupInstalled([m("mistral:7b", "ollama"), m("llama3:8b", "ollama")]);
    expect(groups.map((g) => g.name)).toEqual(["llama3:8b", "mistral:7b"]);
  });

  it("tracks an MLX model's dir path and friendly display name for delete", () => {
    const [g] = groupInstalled([{
      name: "/m/mlx-community_X", size_bytes: 1, modified_at: "", family: "MLX",
      parameter_size: "", quantization: "4bit", backend: "mlx" as const,
      path: "/m/mlx-community_X", display_name: "mlx-community/X",
    }]);
    expect(g.mlxPath).toBe("/m/mlx-community_X");
    expect(g.displayName).toBe("mlx-community/X");
    expect(g.ollamaName).toBeUndefined();
    expect(g.llamaPath).toBeUndefined();
  });
});
