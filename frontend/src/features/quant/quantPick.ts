import type { InstalledModelInfo, BackendKind } from "../../shared/ipc/models/storage";

export interface QuantVariant {
  name: string;
  quantization: string;
  sizeBytes: number;
  backend: BackendKind;
}

export interface QuantGroup {
  key: string; // "Llama 7B" — same base model, different quantizations
  variants: QuantVariant[];
}

/// Group installed models into "same base model, different quant" sets, keyed by
/// family + parameter size. Models missing that metadata (or a quant label) are
/// skipped. **One row per quantization** — the same quant installed under two
/// backends (e.g. imported into Ollama *and* a llama.cpp GGUF on disk) is
/// deduped, first occurrence wins. Variants are sorted smallest-first. Pure.
export function groupQuantVariants(models: InstalledModelInfo[]): QuantGroup[] {
  const by = new Map<string, QuantVariant[]>();
  for (const m of models) {
    if (!m.family || !m.parameter_size || !m.quantization) continue;
    const key = `${m.family} ${m.parameter_size}`;
    const arr = by.get(key) ?? [];
    if (arr.some((v) => v.quantization === m.quantization)) continue;
    arr.push({ name: m.name, quantization: m.quantization, sizeBytes: m.size_bytes, backend: m.backend });
    by.set(key, arr);
  }
  return [...by.entries()]
    .map(([key, variants]) => ({ key, variants: variants.sort((a, b) => a.sizeBytes - b.sizeBytes) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
