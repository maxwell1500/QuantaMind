import { formatBytes } from "../../../shared/format/bytes";
import type { CompareReport, CompareReportModel } from "./buildReport";
import { REPORT_FOOTER } from "./branding";

const metricsLine = (m: NonNullable<CompareReportModel["metrics"]>): string => {
  const parts: string[] = [];
  if (m.ttft_ms != null) parts.push(`TTFT ${m.ttft_ms}ms`);
  if (m.tokens_per_sec != null) parts.push(`${m.tokens_per_sec.toFixed(1)} tok/s`);
  parts.push(`${m.token_count} tokens`);
  return parts.join(" · ");
};

const hardwareLine = (r: CompareReport): string | null => {
  const hw = r.hardware_snapshot;
  if (!hw) return null;
  const label = hw.is_apple_silicon ? "Apple Silicon, unified" : "RAM";
  return `- Hardware: ${formatBytes(hw.total_memory_bytes)} total · ${formatBytes(hw.available_memory_bytes)} available (${label})`;
};

const selectedLine = (r: CompareReport): string => {
  const names = r.models.map((m) => m.size_bytes != null ? `${m.name} (${formatBytes(m.size_bytes)})` : m.name);
  return `- Selected models (${r.models.length}): ${names.join(", ")}`;
};

const modelSection = (m: CompareReportModel): string[] => {
  const lines: string[] = ["", "---", "", `## ${m.name}`];
  if (m.started_at) lines.push(`- Started: ${m.started_at}`);
  if (m.ended_at) lines.push(`- Ended: ${m.ended_at}`);
  if (m.status === "error" && m.error) {
    lines.push(`- Error: ${m.error.kind}: ${m.error.message}`);
    return lines;
  }
  if (m.metrics) lines.push(`- Metrics: ${metricsLine(m.metrics)}`);
  if (m.status === "cancelled") lines.push(`- Status: cancelled`);
  lines.push("");
  lines.push(m.output);
  return lines;
};

export function toMarkdown(r: CompareReport): string {
  const lines: string[] = ["# QuantaMind Compare Report"];
  lines.push(`- Run at: ${r.generated_at}`);
  lines.push(`- Strategy: ${r.strategy}`);
  const hw = hardwareLine(r);
  if (hw) lines.push(hw);
  lines.push(selectedLine(r));
  lines.push("", "## Prompt");
  for (const ln of r.prompt.split("\n")) lines.push(`> ${ln}`);
  for (const m of r.models) lines.push(...modelSection(m));
  lines.push("", "---", "", `_${REPORT_FOOTER}_`);
  return lines.join("\n");
}
