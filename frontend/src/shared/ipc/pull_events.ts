import { z } from "zod";

export const EVENT_PULL_PROGRESS = "pull-progress";

const PullingManifestSchema = z.object({ phase: z.literal("pulling_manifest") });
const DownloadingSchema = z.object({
  phase: z.literal("downloading"),
  digest: z.string(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  speed_bps: z.number().int().nonnegative(),
});
const VerifyingSchema = z.object({ phase: z.literal("verifying") });
const WritingSchema = z.object({ phase: z.literal("writing") });
const SuccessSchema = z.object({ phase: z.literal("success") });
const FailedSchema = z.object({ phase: z.literal("failed"), message: z.string() });

export const PullProgressSchema = z.discriminatedUnion("phase", [
  PullingManifestSchema,
  DownloadingSchema,
  VerifyingSchema,
  WritingSchema,
  SuccessSchema,
  FailedSchema,
]);

export const PullProgressEventSchema = z.object({
  pull_id: z.string(),
  progress: PullProgressSchema,
});

export type PullProgress = z.infer<typeof PullProgressSchema>;
export type PullProgressEvent = z.infer<typeof PullProgressEventSchema>;
