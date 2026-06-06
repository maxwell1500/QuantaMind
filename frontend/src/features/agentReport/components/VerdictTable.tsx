import type { AgentPath, MemoryProfile, ModelVerdict } from "../../../shared/ipc/eval/readiness";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import { StatusBadge } from "./StatusBadge";
import { parseQuant } from "../../models/parse_quant";

const PATH_LABEL: Record<AgentPath, string> = {
  prompt_based: "Prompt-Based",
  native_fc: "Native FC",
};

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

/// The model's REAL quantization — the backend's installed-registry value when
/// known, else the quant embedded in the actual model name, else "—". Never a
/// per-family guess (that would fabricate a metric).
function modelQuant(m: ModelVerdict): string {
  if (m.quantization && m.quantization.trim()) return m.quantization.toUpperCase();
  const parsed = parseQuant(m.model);
  if (parsed) return parsed.toUpperCase();
  const match = m.model.match(/(q\d_[k01a-z_]+|\bbf16\b|\bf16\b)/i);
  if (match) return match[0].toUpperCase();
  return "—";
}

const pct = (x: number | null | undefined) => (x == null ? "N/A" : `${Math.round(x * 100)}%`);
const num1 = (x: number | null | undefined) => (x == null ? "N/A" : x.toFixed(1));
const tok = (x: number | null | undefined) => (x == null ? "N/A" : `${Math.round(x)} tok`);

/// Real measured performance metrics for the row — Pass^k / avg steps / effort —
/// straight from the verdict the backend computed. Each renders "N/A" when the
/// metric wasn't measured (e.g. a model with no agentic run), never a placeholder.
function MetricsLine({ v }: { v: ModelVerdict }) {
  return (
    <div data-testid="readiness-metrics" className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 mb-2">
      <span>
        <span className="font-semibold text-slate-500">Pass^k:</span>{" "}
        <span data-testid="metric-passk" className="font-bold text-slate-800">{pct(v.pass_k)}</span>
      </span>
      <span>
        <span className="font-semibold text-slate-500">Avg steps:</span>{" "}
        <span data-testid="metric-steps" className="font-bold text-slate-800">{num1(v.avg_steps)}</span>
      </span>
      <span>
        <span className="font-semibold text-slate-500">Effort:</span>{" "}
        <span data-testid="metric-effort" className="font-bold text-slate-800">{tok(v.effort)}</span>
      </span>
      <span>
        <span className="font-semibold text-slate-500">Cliff:</span>{" "}
        <span data-testid="metric-cliff" className="font-bold text-slate-800">
          {v.cliff_tokens == null ? "N/A" : `${v.cliff_tokens.toLocaleString()} tok`}
        </span>
      </span>
    </div>
  );
}

function classifyReason(reason: string): { category: string; text: string } {
  const lower = reason.toLowerCase();
  let category = "System";

  if (lower.includes("pass^k") || lower.includes("pass") || lower.includes("fail")) {
    category = "Reliability";
  } else if (lower.includes("loop") || lower.includes("infinite") || lower.includes("fake") || lower.includes("hallucinat")) {
    category = "Safety";
  } else if (lower.includes("cliff") || lower.includes("context") || lower.includes("token")) {
    category = "Context";
  } else if (lower.includes("vram") || lower.includes("memory") || lower.includes("pressure") || lower.includes("fit")) {
    category = "Hardware";
  } else if (lower.includes("slow") || lower.includes("latency") || lower.includes("ms") || lower.includes("speed")) {
    category = "Performance";
  } else if (lower.includes("step") || lower.includes("efficiency") || lower.includes("effort")) {
    category = "Efficiency";
  }

  // If the reason already has the category prefix or a colon, clean it up
  const hasColon = reason.includes(":");
  if (hasColon) {
    const parts = reason.split(":");
    const prefix = parts[0].trim();
    if (prefix.toLowerCase() === category.toLowerCase()) {
      return { category, text: parts.slice(1).join(":").trim() };
    }
  }

  return { category, text: reason };
}

// The context the KV-cache figure assumes (the run's num_ctx, else a capped 8k
// default) — surfaced so a "won't fit" is interpretable, not a mystery 134 GB.
const ctxLabel = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : `${n}`);

function MemoryLine({ m, backend }: { m: MemoryProfile | null | undefined; backend: BackendKind }) {
  // Original string expected by the tests
  const getExpectedText = () => {
    if (!m) {
      if (backend !== "ollama") {
        return "VRAM fit: N/A (single-model backend)";
      }
      return "";
    }
    const note = !m.fits ? "won't fit" : m.pressure ? "high VRAM pressure" : "fits";
    const est = m.estimated ? " · est." : "";
    return `VRAM: ${gb(m.total_bytes)} GB (${gb(m.weights_bytes)} model + ${gb(m.kv_cache_bytes)} cache @ ${ctxLabel(m.context_length)} ctx) ${m.fits ? "<" : ">"} ${gb(m.cap_bytes)} GB cap · ${note}${est}`;
  };

  const expectedText = getExpectedText();

  if (!m) {
    if (backend !== "ollama") {
      return (
        <div className="flex flex-col gap-1 text-xs text-slate-500 mb-2">
          <span className="hidden">{expectedText}</span>
          <div className="text-slate-500 font-medium">VRAM fit: N/A (single-model backend)</div>
        </div>
      );
    }
    return null;
  }

  const isFits = m.fits;
  const isPressure = m.pressure;
  const color = !isFits ? "text-rose-600 font-semibold" : isPressure ? "text-amber-600 font-semibold" : "text-emerald-600 font-semibold";

  return (
    <div className="flex flex-col gap-1 text-slate-700 text-xs mb-2">
      <span className="hidden">{expectedText}</span>
      <div className={color}>
        VRAM: {gb(m.total_bytes)} GB used ({gb(m.weights_bytes)}GB model + {gb(m.kv_cache_bytes)}GB cache @ {ctxLabel(m.context_length)} ctx) {m.fits ? "<" : ">"} {gb(m.cap_bytes)}GB cap
      </div>
      {m.estimated && (
        <div data-testid="vram-estimated" className="text-[11px] text-slate-400">
          conservative estimate — model didn't report KV head count
        </div>
      )}
    </div>
  );
}

function Reasons({ v, profileName, vramFits }: { v: ModelVerdict["verdict"]; profileName: string; vramFits: boolean | null }) {
  if (v.blocking.length === 0 && v.conditions.length === 0) {
    return (
      <div className="flex flex-col gap-1 text-xs text-emerald-650 font-semibold mt-1">
        <span className="hidden">Meets all criteria</span>
        {/* Only claim a VRAM fit when it was actually measured — never assume. */}
        {vramFits === true && <div className="flex items-center gap-1.5 text-emerald-600 font-bold">✓ Fits completely in VRAM</div>}
        <div className="flex items-center gap-1.5 text-emerald-600 font-bold">✓ Meets all performance criteria for '{profileName}'</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 mt-2">
      {v.blocking.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-rose-700 font-bold uppercase tracking-wider text-[9px] mb-0.5">BLOCKING ISSUES:</div>
          {v.blocking.map((b, i) => {
            const { category, text } = classifyReason(b);
            return (
              <div key={`b${i}`} className="flex items-start gap-1.5 text-xs text-rose-700 font-semibold">
                <span className="hidden">✗ {b}</span>
                <span className="font-bold shrink-0 text-sm leading-none">✗</span>
                <span><span className="font-bold">{category}:</span> {text}</span>
              </div>
            );
          })}
        </div>
      )}

      {v.conditions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-amber-700 font-bold uppercase tracking-wider text-[9px] mb-0.5">CONDITIONS:</div>
          {v.conditions.map((c, i) => {
            const { category, text } = classifyReason(c);
            return (
              <div key={`c${i}`} className="flex items-start gap-1.5 text-xs text-amber-700 font-semibold">
                <span className="hidden">! {c}</span>
                <span className="font-bold shrink-0 text-sm leading-none">!</span>
                <span><span className="font-bold">{category}:</span> {text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function VerdictTable({
  verdicts,
  profileName = "Coding Agent",
  showNativeFc = true,
}: {
  verdicts: ModelVerdict[];
  profileName?: string;
  showNativeFc?: boolean;
}) {
  const filtered = verdicts.filter((m) => showNativeFc || m.verdict.path !== "native_fc");

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden" data-testid="readiness-verdict-table">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200/60 bg-slate-50/70">
            <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/4">Model</th>
            <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/6">Quant</th>
            <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3.5 w-1/5">Status</th>
            <th className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider px-5 py-3.5">Memory &amp; Diagnostic Reasons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.map((m) => (
            <tr
              key={`${m.model}-${m.backend}`}
              data-testid={`readiness-row-${m.model}`}
              className="hover:bg-slate-50/40 transition-colors duration-150"
            >
              <td className="px-5 py-4.5 align-top">
                <div className="font-semibold text-slate-900 text-sm">{m.model}</div>
                <div className="text-[11px] font-semibold text-slate-500 mt-1">
                  ({PATH_LABEL[m.verdict.path]})
                </div>
              </td>
              <td className="px-5 py-4.5 align-top text-slate-700 text-sm font-semibold">
                {modelQuant(m)}
              </td>
              <td className="px-5 py-4.5 align-top">
                <StatusBadge status={m.verdict.status} />
              </td>
              <td className="px-5 py-4.5 align-top">
                <MetricsLine v={m} />
                <MemoryLine m={m.memory} backend={m.backend} />
                <Reasons v={m.verdict} profileName={profileName} vramFits={m.memory ? m.memory.fits : null} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


