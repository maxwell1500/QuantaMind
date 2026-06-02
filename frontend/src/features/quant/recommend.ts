import type { HardwareSnapshot } from "../../shared/ipc/compare/hardware";
import { memoryFit } from "../models/fit";
import { formatBytes } from "../../shared/format/bytes";
import type { QuantVariant } from "./quantPick";

export type UseCase = "fast-chat" | "quality-writing" | "coding" | "reasoning";

export const USE_CASES: { id: UseCase; label: string }[] = [
  { id: "fast-chat", label: "Fast chat" },
  { id: "quality-writing", label: "Quality writing" },
  { id: "coding", label: "Coding" },
  { id: "reasoning", label: "Reasoning" },
];

// Rough quality ordering of quant families (low → high bits).
const QUANT_ORDER = ["IQ1", "IQ2", "Q2", "IQ3", "Q3", "IQ4", "Q4", "Q5", "Q6", "Q8", "BF16", "F16", "F32"];

export function quantRank(q: string): number {
  const up = q.toUpperCase();
  return QUANT_ORDER.reduce((r, tok, i) => (up.includes(tok) ? Math.max(r, i) : r), -1);
}

export interface Recommendation {
  pick: QuantVariant | null;
  why: string;
}

const labelOf = (u: UseCase) => USE_CASES.find((c) => c.id === u)?.label ?? u;

function explain(usecase: UseCase, v: QuantVariant, hw: HardwareSnapshot | null): string {
  const where = hw?.is_apple_silicon ? "Mac" : "machine";
  const mem = hw ? `${formatBytes(hw.available_memory_bytes)} ` : "";
  const fit = hw ? memoryFit(v.sizeBytes, hw.available_memory_bytes) : null;
  const fitWord = fit === "fits" ? "fits with headroom" : fit === "tight" ? "is a tight fit" : "should fit";
  const goal =
    usecase === "fast-chat"
      ? "the fastest quant that still runs well"
      : "the highest-quality quant that fits";
  return `For ${labelOf(usecase)} on your ${mem}${where}, ${v.quantization} ${fitWord} — ${goal}.`;
}

/// Recommend a quant for the use case: fast-chat favours the smallest (fastest)
/// fitting variant; quality use cases favour the highest-quality fitting one.
/// Honest when nothing fits or hardware is unknown.
export function recommendQuant(
  usecase: UseCase,
  hw: HardwareSnapshot | null,
  variants: QuantVariant[],
): Recommendation {
  if (variants.length === 0) return { pick: null, why: "No installed quant variants for this model." };
  const avail = hw?.available_memory_bytes ?? 0;
  const fits = hw ? variants.filter((v) => memoryFit(v.sizeBytes, avail) !== "wont-fit") : variants;
  if (hw && fits.length === 0) {
    return { pick: null, why: `None of these quants fit your ~${formatBytes(avail)} of available memory — try a smaller model.` };
  }
  const speedFirst = usecase === "fast-chat";
  const pick = [...fits].sort((a, b) =>
    speedFirst ? a.sizeBytes - b.sizeBytes : quantRank(b.quantization) - quantRank(a.quantization),
  )[0];
  return { pick, why: explain(usecase, pick, hw) };
}
