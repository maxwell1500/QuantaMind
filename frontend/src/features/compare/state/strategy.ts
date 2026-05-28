import type { HardwareSnapshot } from "../../../shared/ipc/hardware";

/// Compare verdict per run strategy. Pure module — no React, no IPC.
/// `required_bytes` is in bytes; uses a 1.3× safety multiplier over the
/// model's on-disk size to approximate runtime memory (KV cache + ctx
/// buffer). `risky` kicks in above 70% of available memory.

export type Verdict = "ok" | "risky" | "wont_fit";
export type StrategyId = "sequential" | "parallel";
export type StrategyAssessment = { status: Verdict; required_bytes: number };
export type StrategyMatrix = Record<StrategyId, StrategyAssessment>;

const SAFETY = 1.3;
const RISKY_FRACTION = 0.7;

type ModelLike = { size_bytes: number };

function verdict(need: number, avail: number): Verdict {
  if (avail <= 0) return need > 0 ? "wont_fit" : "ok";
  if (need > avail) return "wont_fit";
  if (need > avail * RISKY_FRACTION) return "risky";
  return "ok";
}

export function assessStrategies(
  models: ReadonlyArray<ModelLike>,
  snapshot: HardwareSnapshot | null,
): StrategyMatrix | null {
  if (!snapshot || models.length === 0) return null;
  const required = models.map((m) => Math.ceil(m.size_bytes * SAFETY));
  const maxReq = Math.max(...required);
  const sumReq = required.reduce((a, b) => a + b, 0);
  const avail = snapshot.available_memory_bytes;
  return {
    sequential: { status: verdict(maxReq, avail), required_bytes: maxReq },
    parallel: { status: verdict(sumReq, avail), required_bytes: sumReq },
  };
}
