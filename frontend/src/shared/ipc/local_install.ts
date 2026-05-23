import { z } from "zod";

export const EVENT_LOCAL_INSTALL_PROGRESS = "local-install-progress";

const Hashing = z.object({
  phase: z.literal("hashing"),
  bytes_completed: z.number().int().nonnegative(),
  bytes_total: z.number().int().nonnegative(),
});
const Uploading = z.object({
  phase: z.literal("uploading"),
  bytes_completed: z.number().int().nonnegative(),
  bytes_total: z.number().int().nonnegative(),
});
const Creating = z.object({ phase: z.literal("creating") });

export const LocalInstallPhaseSchema = z.discriminatedUnion("phase", [
  Hashing, Uploading, Creating,
]);
export type LocalInstallPhase = z.infer<typeof LocalInstallPhaseSchema>;
