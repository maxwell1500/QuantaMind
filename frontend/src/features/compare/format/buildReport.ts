import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { StrategyId } from "../state/strategy";
import type { CompareRow, RowStatus, CompareModel } from "../state/compareStore";
import { REPORT_FOOTER } from "./branding";

export interface CompareReportModel {
  name: string;
  size_bytes: number | null;
  started_at: string | null;
  ended_at: string | null;
  output: string;
  metrics: { ttft_ms: number | null; tokens_per_sec: number | null; token_count: number } | null;
  status: RowStatus;
  error: { kind: string; message: string } | null;
}

export interface CompareReport {
  schema_version: number;
  generated_at: string;
  generated_by: string;
  prompt: string;
  strategy: StrategyId;
  hardware_snapshot: HardwareSnapshot | null;
  models: CompareReportModel[];
}

export interface BuildReportInput {
  prompt: string;
  strategy: StrategyId;
  hardwareSnapshot: HardwareSnapshot | null;
  selectedModels: CompareModel[];
  rows: CompareRow[];
  now?: () => Date;
}

export function buildReport(input: BuildReportInput): CompareReport {
  const now = input.now ?? (() => new Date());
  return {
    schema_version: 1,
    generated_at: now().toISOString(),
    generated_by: REPORT_FOOTER,
    prompt: input.prompt,
    strategy: input.strategy,
    hardware_snapshot: input.hardwareSnapshot,
    models: input.rows.map((r) => ({
      name: r.model,
      size_bytes: input.selectedModels.find((m) => m.name === r.model)?.size_bytes ?? null,
      started_at: r.startedAt,
      ended_at: r.endedAt,
      output: r.output,
      metrics: r.metrics,
      status: r.status,
      error: r.error,
    })),
  };
}
