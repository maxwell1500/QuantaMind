/// "Will this model fit my machine?" for the download table. Mirrors the
/// compare feature's rule (features/compare/state/strategy.ts): a 1.3× safety
/// multiplier over on-disk size approximates runtime memory, and "tight" kicks
/// in above 70% of available memory. Pure — no React, no IPC.

export type Fit = "fits" | "tight" | "wont-fit";

const SAFETY = 1.3;
const TIGHT_FRACTION = 0.7;

export function memoryFit(sizeBytes: number, availBytes: number): Fit {
  const need = Math.ceil(sizeBytes * SAFETY);
  if (availBytes <= 0) return sizeBytes > 0 ? "wont-fit" : "fits";
  if (need > availBytes) return "wont-fit";
  if (need > availBytes * TIGHT_FRACTION) return "tight";
  return "fits";
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
