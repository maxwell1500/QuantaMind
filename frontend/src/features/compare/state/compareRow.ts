import type { TokenTiming } from "../../../shared/ipc/events/events";

export type CompareModel = { name: string; size_bytes: number };
export type RowStatus = "pending" | "loading" | "running" | "done" | "cancelled" | "error";

export interface CompareRow {
  model: string;
  modelId: string | null;
  status: RowStatus;
  output: string;
  metrics: {
    ttft_ms: number | null;
    tokens_per_sec: number | null;
    token_count: number;
    timeline?: TokenTiming[];
  } | null;
  error: { kind: string; message: string } | null;
  startedAt: string | null;
  endedAt: string | null;
}

export const newRow = (model: string): CompareRow => ({
  model, modelId: null, status: "pending", output: "",
  metrics: null, error: null, startedAt: null, endedAt: null,
});

export const updateRow = (rows: CompareRow[], model: string, patch: Partial<CompareRow>): CompareRow[] =>
  rows.map((r) => (r.model === model ? { ...r, ...patch } : r));
