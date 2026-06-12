import type { CompareRow } from "../state/compareStore";

export type Metric = "tokens_per_sec" | "ttft_ms";
export interface Bar {
  model: string;
  value: number;
  fraction: number; // value / max, for the bar width
}

/// Build normalized bars for one metric across the done rows. Rows without the
/// metric are skipped; `fraction` is value/max (0 when no data). Pure.
export function barRows(rows: CompareRow[], metric: Metric): Bar[] {
  const vals: { model: string; value: number }[] = [];
  for (const r of rows) {
    const v = r.status === "done" ? r.metrics?.[metric] : null;
    if (typeof v === "number") vals.push({ model: r.model, value: v });
  }
  const max = vals.reduce((m, b) => Math.max(m, b.value), 0);
  return vals.map((b) => ({ ...b, fraction: max > 0 ? b.value / max : 0 }));
}
