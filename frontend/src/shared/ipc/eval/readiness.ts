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

export const ModelVerdictSchema = z.object({
  model: z.string(),
  backend: BackendKindSchema,
  verdict: ReadinessVerdictSchema,
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

/// Assess a collection's last persisted batch report against a profile. An empty
/// array means no run has been persisted yet — the page shows an empty state.
export async function assessReadiness(
  collectionId: string,
  profileId: string,
): Promise<ModelVerdict[]> {
  return z
    .array(ModelVerdictSchema)
    .parse(await invoke("assess_readiness", { collectionId, profileId }));
}
