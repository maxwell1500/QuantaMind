import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { type ModelVerdict } from "../eval/readiness";
import { type InferenceParams } from "../workspace/prompts";

/// What the desktop client should do next — mirror of the Rust `PublishOutcome`.
/// Every server status is one of these so the UI never sees an opaque throw.
export const PublishOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), board_url: z.string() }),
  z.object({ kind: z.literal("needs_auth") }),
  z.object({ kind: z.literal("invalid"), index: z.number(), reason: z.string() }),
  z.object({ kind: z.literal("update_required") }),
  z.object({ kind: z.literal("rate_limited") }),
]);
export type PublishOutcome = z.infer<typeof PublishOutcomeSchema>;

/// Publish the verdicts (+ the global-header params the run used + the active
/// collection id + optional allow-listed write-up link) to the community board. One
/// batch = one request; the Rust side handles nonce/hash/auth and rebuilds the exact
/// same payload the preview showed.
export async function publishToBoard(verdicts: ModelVerdict[], params: InferenceParams, collectionId: string, collectionHash: string | null, link: string): Promise<PublishOutcome> {
  return PublishOutcomeSchema.parse(await invoke("publish_to_board", { verdicts, params, collectionId, collectionHash, link: link || null }));
}

/// Start the PKCE browser sign-in (opens the system browser, catches the loopback
/// redirect, stores the rotated refresh token). Resolves once a token is stored.
/// Returns `true` if the token reached durable keychain storage, `false` if it's
/// session-only (keychain locked/denied) — the caller warns the user in that case.
export async function startLogin(): Promise<boolean> {
  return Boolean(await invoke("start_login"));
}
