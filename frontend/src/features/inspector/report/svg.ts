import type { LatencyBar, TimelineStats } from "../format/timeline";
import type { HistogramBucket } from "../format/histogram";

const COLOR: Record<LatencyBar["kind"], string> = {
  ttft: "#7c3aed",
  normal: "#2563eb",
  outlier: "#e11d48",
};

const PAD = 6;

/// Inline-SVG bar chart of per-token latency for a standalone report (no
/// Tailwind/JS — every attribute inline). Pure string builder.
export function timelineSvg(bars: LatencyBar[], stats: TimelineStats, w = 640, h = 120): string {
  if (bars.length === 0) return "";
  const iw = w - PAD * 2;
  const ih = h - PAD * 2;
  const yMax = (stats.gapMaxMs > 0 ? stats.gapMaxMs : stats.maxMs) || 1;
  const bw = iw / bars.length;
  const rects = bars
    .map((b, i) => {
      const bh = Math.min(ih, Math.max(0, (b.latencyMs / yMax) * ih));
      return `<rect x="${(PAD + i * bw).toFixed(1)}" y="${(PAD + ih - bh).toFixed(1)}" width="${(bw * 0.8).toFixed(1)}" height="${bh.toFixed(1)}" fill="${COLOR[b.kind]}"/>`;
    })
    .join("");
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

/// Inline-SVG histogram of inter-token latencies; outlier bins rose. Pure.
export function histogramSvg(buckets: HistogramBucket[], w = 640, h = 90): string {
  if (buckets.length === 0) return "";
  const iw = w - PAD * 2;
  const ih = h - PAD * 2;
  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const bw = iw / buckets.length;
  const rects = buckets
    .map((b, i) => {
      const bh = (b.count / maxCount) * ih;
      return `<rect x="${(PAD + i * bw).toFixed(1)}" y="${(PAD + ih - bh).toFixed(1)}" width="${(bw * 0.85).toFixed(1)}" height="${bh.toFixed(1)}" fill="${b.hasOutlier ? COLOR.outlier : COLOR.normal}"/>`;
    })
    .join("");
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

/// Inline-styled stacked bar (TTFT / VRAM segments). Pure.
export function stackedBarHtml(segments: { label: string; value: number; color: string }[], total: number): string {
  if (segments.length === 0 || total <= 0) return "";
  const parts = segments
    .map((s) => `<div style="width:${((s.value / total) * 100).toFixed(1)}%;background:${s.color};height:12px" title="${s.label}"></div>`)
    .join("");
  return `<div style="display:flex;width:100%;height:12px;border-radius:4px;overflow:hidden;background:#f1f5f9">${parts}</div>`;
}
