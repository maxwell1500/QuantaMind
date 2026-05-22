import { z } from "zod";
import raw from "./ollama-catalog.json";

export const TagSchema = z.enum([
  "chat",
  "coding",
  "embedding",
  "vision",
  "small",
  "medium",
  "large",
]);
export type Tag = z.infer<typeof TagSchema>;

export const ModelCatalogEntrySchema = z.object({
  name: z.string().min(1),
  family: z.string().min(1),
  parameterSize: z.string().min(1),
  description: z.string().min(1),
  estimatedDiskGB: z.number().positive(),
  tags: z.array(TagSchema).nonempty(),
  defaultQuantization: z.string().min(1),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

/// Parsed at import time — any schema violation throws here and the
/// frontend build (tsc + vite) refuses to bundle a bad catalog.
export const OllamaCatalog: ReadonlyArray<ModelCatalogEntry> = z
  .array(ModelCatalogEntrySchema)
  .nonempty()
  .parse(raw);
