/// Detect whether an Ollama model is embedding-only (no /api/generate).
/// Used to hide embedding models from the Workspace picker and the
/// Compare multi-select — they would 400 on a generate request and the
/// UI has nowhere useful to send their output yet.

export type ModelLike = { name: string; family?: string };

const EMBEDDING_FAMILIES = new Set(["bert", "nomic-bert"]);

export function isEmbeddingModel(m: ModelLike): boolean {
  const family = (m.family ?? "").toLowerCase();
  if (EMBEDDING_FAMILIES.has(family)) return true;
  const name = m.name.toLowerCase();
  if (name.includes("embed")) return true;
  if (/^bge[-:](m3|small|base|large)/.test(name)) return true;
  if (name.startsWith("all-minilm")) return true;
  return false;
}
