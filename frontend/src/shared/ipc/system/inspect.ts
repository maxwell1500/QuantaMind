import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { BackendKind } from "../models/storage";

/// Model metadata from Ollama's /api/show (template, capabilities) + an advisory
/// base-model guess. `available` is false on non-Ollama backends.
export const ModelDimsSchema = z.object({
  layers: z.number().int().nonnegative(),
  head_count: z.number().int().nonnegative(),
  head_count_kv: z.number().int().nonnegative(),
  embedding_length: z.number().int().nonnegative(),
  context_length: z.number().int().nonnegative(),
});
export type ModelDims = z.infer<typeof ModelDimsSchema>;

export const ModelInspectSchema = z.object({
  available: z.boolean(),
  note: z.string().nullable(),
  template: z.string(),
  capabilities: z.array(z.string()),
  family: z.string().nullable(),
  parameter_size: z.string().nullable(),
  quantization: z.string().nullable(),
  is_base_guess: z.boolean(),
  base_reason: z.string().nullable(),
  dims: ModelDimsSchema.nullable(),
});
export type ModelInspect = z.infer<typeof ModelInspectSchema>;

export async function inspectModel(model: string, backend: BackendKind): Promise<ModelInspect> {
  return ModelInspectSchema.parse(await invoke("inspect_model", { model, backend }));
}

/// f16 KV-cache size (bytes) for a model's dims at a context length — computed
/// by the canonical Rust formula (single source of truth).
export async function estimateKvCacheBytes(dims: ModelDims, contextLength: number): Promise<number> {
  return z.number().parse(
    await invoke("estimate_kv_cache_bytes", {
      layers: dims.layers,
      headCount: dims.head_count,
      headCountKv: dims.head_count_kv,
      embeddingLength: dims.embedding_length,
      contextLength,
    }),
  );
}
