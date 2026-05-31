import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const RssSchema = z.number().int().nonnegative().nullable();

/// Total resident memory (bytes) of the Ollama processes, or null if not
/// running / not measurable. Best-effort — never throws.
export async function ollamaRss(): Promise<number | null> {
  try {
    return RssSchema.parse(await invoke("get_ollama_rss"));
  } catch (e) {
    console.error("get_ollama_rss failed:", e);
    return null;
  }
}
