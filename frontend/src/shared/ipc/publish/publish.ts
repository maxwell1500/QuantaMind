import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { type ModelVerdict } from "../eval/readiness";

/// What the desktop client should do next — mirror of the Rust `PublishOutcome`.
/// Every server status is one of these so the UI never sees an opaque throw.
export const PublishOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok"), board_url: z.string() }),
  z.object({ kind: z.literal("needs_auth") }),
  z.object({ kind: z.literal("invalid"), index: z.number() }),
  z.object({ kind: z.literal("update_required") }),
  z.object({ kind: z.literal("rate_limited") }),
]);
export type PublishOutcome = z.infer<typeof PublishOutcomeSchema>;

/// Publish the verdicts (+ optional allow-listed write-up link) to the community
/// board. One batch = one request; the Rust side handles nonce/hash/auth.
export async function publishToBoard(verdicts: ModelVerdict[], link: string): Promise<PublishOutcome> {
  return PublishOutcomeSchema.parse(await invoke("publish_to_board", { verdicts, link: link || null }));
}

/// Start the PKCE browser sign-in (opens the system browser, catches the loopback
/// redirect, stores the rotated refresh token). Resolves once a token is stored.
export async function startLogin(): Promise<void> {
  await invoke("start_login");
}
