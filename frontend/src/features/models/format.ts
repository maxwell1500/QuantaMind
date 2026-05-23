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

/// Format a byte count as "1.3GB", "850MB", "12KB", "999B" (1 decimal,
/// no space before unit). Matches the audit's data-quality requirement.
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)}${units[i]}`;
}

/// Format a duration in seconds as "45s", "3m 24s", or "1h 5m". Caps at
/// hours; longer is reported as the same hour count. Rounds down.
export function formatDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r === 0 ? `${m}m` : `${m}m ${r}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
