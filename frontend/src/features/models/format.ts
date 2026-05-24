/// Derive the Ollama model name from an HF GGUF filename. When a
/// quantization is supplied the name is encoded as `<base>:<quant>` to
/// satisfy Ollama 0.24+ which rejects names that look like an untagged
/// blob with embedded dots ("invalid model name"). The trailing quant
/// suffix on the base (e.g. `-Q4_K_M`, `.Q4_K_M`) is stripped so the
/// quant doesn't appear twice. The HF detail page and the install
/// dispatch both call this so they stay in sync.
///
/// Some HF repos publish GGUFs inside a subdirectory (e.g.
/// `bert-bge-small/ggml-model-f16-big-endian.gguf`) — the slash would
/// be rejected by the backend's `validate_name`. We sanitize any char
/// in the backend's bad-char set (path separators, quotes, whitespace,
/// nulls) into `-`, keeping the `:` tag separator intact.

const ILLEGAL_NAME_CHARS = /[\/\\\0"' \t\n]/g;

function sanitizeNameSegment(s: string): string {
  return s.replace(ILLEGAL_NAME_CHARS, "-");
}

export function hfVariantModelName(filename: string, quantization?: string): string {
  const base = sanitizeNameSegment(filename.replace(/\.gguf$/i, "").toLowerCase());
  if (!quantization) return base;
  const q = sanitizeNameSegment(quantization.toLowerCase());
  const stripped = base.replace(new RegExp(`[._-]${q}$`), "");
  return `${stripped}:${q}`;
}
