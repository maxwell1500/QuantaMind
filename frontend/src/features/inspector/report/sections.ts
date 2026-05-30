import type { CompareRow } from "../../compare/state/compareRow";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { LoadedModel } from "../../../shared/ipc/system/vram";
import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { formatBytes } from "../../../shared/format/bytes";
import { buildLatencyBars } from "../format/timeline";
import { buildHistogram } from "../format/histogram";
import { buildTtftSegments } from "../format/ttft";
import { buildVramSegments } from "../format/vram";
import { coldWarmSummary } from "../format/coldwarm";
import { regressionVerdict } from "../format/regression";
import { timelineSvg, histogramSvg, stackedBarHtml } from "./svg";

const TTFT_COLOR: Record<string, string> = { load: "#7c3aed", prefill: "#2563eb", remainder: "#9ca3af" };

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const row = (k: string, v: string) => `<div class="row"><span class="k">${esc(k)}</span><span>${esc(v)}</span></div>`;

export function hardwareHtml(hw: HardwareSnapshot | null): string {
  if (!hw) return "<p class=muted>Hardware not available.</p>";
  const g = hw.gpu;
  const gpu = !g || !g.available ? "Not available"
    : g.unified ? `${g.name ?? "Integrated"} · unified memory`
    : `${g.name ?? "GPU"}${g.vram_total_bytes != null ? ` · ${formatBytes(g.vram_total_bytes)}` : ""}`;
  return `<section><h2>Hardware</h2>${row("CPU", hw.cpu || "—")}` +
    row("Memory", `${formatBytes(hw.total_memory_bytes)} total · ${formatBytes(hw.available_memory_bytes)} available`) +
    row("GPU", gpu) + row("OS", [hw.os_name, hw.os_version].filter(Boolean).join(" ") || "—") +
    row("Arch", hw.arch || "—") + "</section>";
}

export function modelSectionHtml(r: CompareRow, vram: LoadedModel | undefined, history: HistoryEntry[], nowMs: number): string {
  const m = r.metrics;
  const { bars, stats } = buildLatencyBars(m?.timeline ?? [], m?.ttft_ms ?? null);
  const tps = m?.tokens_per_sec != null ? `${m.tokens_per_sec.toFixed(1)} tok/s` : "— tok/s";
  const ttft = buildTtftSegments(m?.ttft_ms ?? null, m?.stats);
  const ttftBar = stackedBarHtml(ttft.segments.map((s) => ({ label: s.label, value: s.ms, color: TTFT_COLOR[s.key] })), ttft.total);
  const vramHtml = vram
    ? stackedBarHtml(buildVramSegments(vram.size_bytes, vram.size_vram_bytes).segments
        .map((s) => ({ label: s.label, value: s.bytes, color: s.key === "vram" ? "#059669" : "#9ca3af" })), vram.size_bytes)
    : "<span class=muted>VRAM not available</span>";
  const cw = coldWarmSummary(history, r.model);
  const cwText = cw ? `Cold TTFT ${cw.cold.avgTtftMs}ms vs warm ${cw.warm.avgTtftMs}ms (cold adds ~${cw.deltaTtftMs}ms)` : "no cold/warm comparison yet";
  const reg = regressionVerdict(history, r.model, nowMs);
  const regText = reg.status === "slow" ? `⚠ ${Math.round(reg.pctSlower)}% slower than 7-day baseline`
    : reg.status === "ok" ? "on par with 7-day baseline" : "no baseline yet";
  return `<section><h2>${esc(r.model)}</h2>` +
    `<p>${m?.token_count ?? 0} tokens · TTFT ${m?.ttft_ms ?? "—"}ms · ${tps}</p>` +
    `<p class=label>TTFT breakdown</p>${ttftBar}` +
    `<p class=label>VRAM</p>${vramHtml}` +
    `<p class=label>Token latency</p>${timelineSvg(bars, stats)}` +
    `<p class=label>Latency distribution</p>${histogramSvg(buildHistogram(bars))}` +
    `<p class=muted>${esc(cwText)} · ${esc(regText)}</p></section>`;
}
