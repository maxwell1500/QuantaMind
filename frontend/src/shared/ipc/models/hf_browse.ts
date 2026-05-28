import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const HfSearchHitSchema = z.object({
  id: z.string().min(1),
  downloads: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  last_modified: z.string().nullable(),
});
export type HfSearchHit = z.infer<typeof HfSearchHitSchema>;

export const HfRepoFileSchema = z.object({
  path: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
});
export type HfRepoFile = z.infer<typeof HfRepoFileSchema>;

export async function hfSearch(query: string, limit?: number): Promise<HfSearchHit[]> {
  const raw = await invoke("hf_search", { query, limit });
  return z.array(HfSearchHitSchema).parse(raw);
}

export async function hfRepoFiles(repo: string): Promise<HfRepoFile[]> {
  const raw = await invoke("hf_repo_files", { repo });
  return z.array(HfRepoFileSchema).parse(raw);
}
