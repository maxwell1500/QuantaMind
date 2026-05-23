/// Derive the Ollama model name from an HF GGUF filename. When a
/// quantization is supplied the name is encoded as `<base>:<quant>` to
/// satisfy Ollama 0.24+ which rejects names that look like an untagged
/// blob with embedded dots ("invalid model name"). The trailing quant
/// suffix on the base (e.g. `-Q4_K_M`, `.Q4_K_M`) is stripped so the
/// quant doesn't appear twice. The HF detail page and the install
/// dispatch both call this so they stay in sync.
export function hfVariantModelName(filename: string, quantization?: string): string {
  const base = filename.replace(/\.gguf$/i, "").toLowerCase();
  if (!quantization) return base;
  const q = quantization.toLowerCase();
  const stripped = base.replace(new RegExp(`[._-]${q}$`), "");
  return `${stripped}:${q}`;
}
