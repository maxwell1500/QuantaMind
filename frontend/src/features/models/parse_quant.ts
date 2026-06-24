/// Parse a GGUF quantization label (e.g. "Q4_K_M", "IQ4_XS", "BF16") from
/// a filename. Returns the canonical uppercase token, or null if no
/// known quant suffix is found. The HF search path uses this to project
/// raw file listings into the same shape the install dispatch expects.

const KNOWN_QUANTS = [
  "IQ1_S", "IQ1_M",
  "IQ2_XXS", "IQ2_XS", "IQ2_S", "IQ2_M",
  "IQ3_XXS", "IQ3_XS", "IQ3_S", "IQ3_M",
  "IQ4_XS", "IQ4_NL",
  "Q2_K",
  "Q3_K_S", "Q3_K_M", "Q3_K_L",
  "Q4_0", "Q4_1", "Q4_K_S", "Q4_K_M",
  "Q5_0", "Q5_1", "Q5_K_S", "Q5_K_M",
  "Q6_K",
  "Q8_0",
  "BF16", "F16", "F32",
] as const;

const SORTED = [...KNOWN_QUANTS].sort((a, b) => b.length - a.length);
const isSep = (ch: string | undefined) =>
  ch === undefined || ch === "." || ch === "_" || ch === "-";

export function parseQuant(filename: string): string | null {
  const stem = filename.replace(/\.gguf$/i, "").toUpperCase();
  for (const q of SORTED) {
    const idx = stem.lastIndexOf(q);
    if (idx === -1) continue;
    if (isSep(stem[idx - 1]) && isSep(stem[idx + q.length])) return q;
  }
  return null;
}
