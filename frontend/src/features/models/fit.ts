/// "Will this model fit my machine?" for the download table. Mirrors the
/// compare feature's rule (features/compare/state/strategy.ts): a 1.3× safety
/// multiplier over on-disk size approximates runtime memory, and "tight" kicks
/// in above 70% of available memory. Pure — no React, no IPC.

export type Fit = "fits" | "tight" | "wont-fit";

const SAFETY = 1.3;
const TIGHT_FRACTION = 0.7;

/// Fit verdict for a precomputed memory NEED (e.g. base weights + KV cache),
/// without the blanket safety multiplier — used by the KV-aware VRAM predictor.
export function fitOfNeed(needBytes: number, availBytes: number): Fit {
  if (availBytes <= 0) return needBytes > 0 ? "wont-fit" : "fits";
  if (needBytes > availBytes) return "wont-fit";
  if (needBytes > availBytes * TIGHT_FRACTION) return "tight";
  return "fits";
}

/// File-size-only fit for the download table: a 1.3× multiplier approximates
/// runtime memory when the model's architecture (and thus KV cache) is unknown.
export function memoryFit(sizeBytes: number, availBytes: number): Fit {
  return fitOfNeed(Math.ceil(sizeBytes * SAFETY), availBytes);
}

/// Display text + Tailwind colour for a fit verdict.
export function fitBadge(fit: Fit): { text: string; cls: string } {
  switch (fit) {
    case "fits":
      return { text: "Fits", cls: "text-green-600" };
    case "tight":
      return { text: "Tight", cls: "text-amber-700" };
    case "wont-fit":
      return { text: "Won't fit", cls: "text-red-600" };
  }
}
