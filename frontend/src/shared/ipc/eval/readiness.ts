import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { BackendKindSchema } from "../models/storage";

/// A use-case preset the verdict is measured against (mirror of the Rust
/// `ReadinessProfile`). Hard gates (`require_*`, `min_*`) block; soft targets
/// (`max_*`) downgrade to Conditional. Nullable fields mean "metric ignored".
export const ReadinessProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  min_pass_k: z.number(),
  max_avg_steps: z.number().nullable(),
  max_ms_per_step: z.number().nullable(),
  min_context_tokens: z.number().nullable(),
  forbid_infinite_loop: z.boolean(),
  forbid_hallucinated_completion: z.boolean(),
  require_full_vram: z.boolean(),
  require_native_fc: z.boolean(),
});
export type ReadinessProfile = z.infer<typeof ReadinessProfileSchema>;

export const ReadinessSchema = z.enum(["ready", "conditional", "not_ready"]);
export type Readiness = z.infer<typeof ReadinessSchema>;

/// Which path produced the verdict — prompt-based proxy vs native tool-calling.
export const AgentPathSchema = z.enum(["prompt_based", "native_fc"]);
export type AgentPath = z.infer<typeof AgentPathSchema>;

export const ReadinessVerdictSchema = z.object({
  status: ReadinessSchema,
  blocking: z.array(z.string()),
  conditions: z.array(z.string()),
  path: AgentPathSchema,
});
export type ReadinessVerdict = z.infer<typeof ReadinessVerdictSchema>;

/// One model's measured memory footprint vs the allocation cap (Phase 7.4).
/// Present only when VRAM fit was measured (Ollama + a cap); absent otherwise.
export const MemoryProfileSchema = z.object({
  weights_bytes: z.number().int().nonnegative(),
  kv_cache_bytes: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  cap_bytes: z.number().int().nonnegative(),
  context_length: z.number().int().nonnegative(),
  fits: z.boolean(),
  pressure: z.boolean(),
  // KV cache sized from a defaulted head_count_kv → a conservative overestimate.
  estimated: z.boolean().optional(),
});
export type MemoryProfile = z.infer<typeof MemoryProfileSchema>;

/// The context-cliff outcome (mirror of the Rust `CliffStatus`): not probed,
/// no cliff up to `tested`, or collapsed at `depth`.
export const CliffStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("NotProbed") }),
  z.object({ status: z.literal("NoCliff"), tested: z.number() }),
  z.object({ status: z.literal("Collapsed"), depth: z.number() }),
]);
export type CliffStatus = z.infer<typeof CliffStatusSchema>;

export const ModelVerdictSchema = z.object({
  model: z.string(),
  backend: BackendKindSchema,
  verdict: ReadinessVerdictSchema,
  memory: MemoryProfileSchema.nullish(),
  // Efficiency telemetry for the recommender ranking (Phase 7.3). The backend
  // returns verdicts already ranked best-first.
  avg_steps: z.number().nullish(),
  effort: z.number().nullish(),
  // Real measured metrics for the verdict row — never guessed. `pass_k` is the
  // native-first Pass^k fraction; `quantization` is the model's real quant from the
  // installed-models registry. Both null → rendered "N/A"/"—".
  pass_k: z.number().nullish(),
  quantization: z.string().nullish(),
  // The context-cliff outcome for this collection (NotProbed/NoCliff/Collapsed).
  // Absent → treated as NotProbed ("N/A"). The hard gate only blocks when a profile
  // sets `min_context_tokens` (strict: NoCliff passes iff tested ≥ min).
  cliff: CliffStatusSchema.optional(),
});
export type ModelVerdict = z.infer<typeof ModelVerdictSchema>;

/// Every readiness profile (built-ins seeded by Rust on first call).
export async function listReadinessProfiles(): Promise<ReadinessProfile[]> {
  return z.array(ReadinessProfileSchema).parse(await invoke("list_readiness_profiles"));
}

export async function saveReadinessProfile(profile: ReadinessProfile): Promise<void> {
  await invoke("save_readiness_profile", { profile });
}

export async function deleteReadinessProfile(id: string): Promise<void> {
  await invoke("delete_readiness_profile", { id });
}

/// Assess a collection's last persisted batch report against a profile. When
/// `capBytes` is set, VRAM fit is measured for each Ollama model against that
/// allocation cap. An empty array means no run has been persisted yet — the page
/// shows an empty state.
export async function assessReadiness(
  collectionId: string,
  profileId: string,
  capBytes?: number,
): Promise<ModelVerdict[]> {
  return z
    .array(ModelVerdictSchema)
    .parse(await invoke("assess_readiness", { collectionId, profileId, capBytes }));
}
