import { z } from "zod";
import raw from "./huggingface-catalog.json";

export const HfVariantSchema = z.object({
  filename: z.string().min(1).regex(/\.gguf$/i, "filename must end in .gguf"),
  quantization: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  quality: z.string().min(1),
});
export type HfVariant = z.infer<typeof HfVariantSchema>;

export const HfRepoEntrySchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-.]+$/, "repo must be namespace/name"),
  baseModel: z.string().min(1),
  family: z.string().min(1),
  description: z.string().min(1),
  license: z.string().min(1),
  variants: z.array(HfVariantSchema).nonempty(),
});
export type HfRepoEntry = z.infer<typeof HfRepoEntrySchema>;

/// Parsed at module load — any catalog schema violation throws here and
/// `tsc && vite build` refuses to bundle a bad catalog.
export const HuggingFaceCatalog: ReadonlyArray<HfRepoEntry> = z
  .array(HfRepoEntrySchema)
  .nonempty()
  .parse(raw);
