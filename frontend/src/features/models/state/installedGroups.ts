import type { InstalledModelInfo } from "../../../shared/ipc/models/storage";

export interface ModelGroup {
  name: string;
  family: string;
  parameterSize: string;
  quantization: string;
  sizeBytes: number;
  ollamaName?: string; // actual Ollama tag (for delete), present if in Ollama
  llamaPath?: string; // folder GGUF path (for add-to-ollama), present if local
  mlxPath?: string; // MLX model dir (for delete), present if an MLX download
  displayName?: string; // friendly label when `name` isn't presentable (MLX)
}

// Ollama tags imported models `:latest`; the llama.cpp folder name is the bare
// stem. Key on the base name so the two collapse into one entry.
const base = (n: string): string => n.replace(/:latest$/, "");

/// Collapse the merged installed list into one entry per model, tracking which
/// backends have it, so the UI can show Ollama / llama.cpp availability + the
/// right actions without duplicate rows.
export function groupInstalled(list: InstalledModelInfo[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const m of list) {
    const key = base(m.name);
    const g = map.get(key) ?? {
      name: key,
      family: m.family,
      parameterSize: m.parameter_size,
      quantization: m.quantization,
      sizeBytes: m.size_bytes,
    };
    if (m.backend === "ollama") g.ollamaName = m.name;
    if (m.backend === "llama_cpp") g.llamaPath = m.path ?? g.llamaPath;
    if (m.backend === "mlx") {
      g.mlxPath = m.path ?? g.mlxPath;
      g.displayName = m.display_name ?? g.displayName;
    }
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
