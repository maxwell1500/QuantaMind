import { useEffect, useState } from "react";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useNavStore } from "../../../shared/state/navStore";
import { formatBytes } from "../../../shared/format/bytes";
import { memoryFit, fitOfNeed, fitBadge, type Fit } from "../../models/fit";
import { groupQuantVariants } from "../quantPick";
import { recommendQuant, quantRank, USE_CASES, type UseCase } from "../recommend";
import { useQuantEval, type QuantScore } from "../useQuantEval";
import { useQuantToolcall } from "../useQuantToolcall";
import { useVramFit } from "../useVramFit";
import { servesModelsByName, QUANT_OLLAMA_ONLY_NOTE } from "../../../shared/models/backendSupport";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { QUANT_HELP, QUANT_COLUMN_HELP } from "../help";

const CTX_OPTIONS = [4096, 8192, 32768, 131072];
const ctxLabel = (n: number) => (n % 1024 === 0 ? `${n / 1024}K` : `${n}`);

interface RowFit {
  fit: Fit;
  oom: boolean;
  approx: boolean;
}

/// KV-aware fit: base weights + KV cache(context) vs available memory. Falls
/// back to the file-size×1.3 heuristic (flagged approx) when dims are unknown
/// (non-Ollama). `oom` blocks running that quant at the chosen context.
export function predictFit(sizeBytes: number, kvBytes: number | null, avail: number): RowFit {
  if (kvBytes != null) {
    const fit = fitOfNeed(sizeBytes + kvBytes, avail);
    return { fit, oom: fit === "wont-fit", approx: false };
  }
  const fit = memoryFit(sizeBytes, avail);
  return { fit, oom: fit === "wont-fit", approx: true };
}

function toolcallText(score: number | null | undefined, running: boolean): string {
  if (score === undefined) return running ? "…" : "—";
  if (score === null) return "n/a";
  return `${Math.round(score * 100)}%`;
}

function qualityText(score: QuantScore | undefined, running: boolean): string {
  if (!score) return running ? "…" : "—";
  if (score.error) return "error";
  return `${score.passed}/${score.total}`;
}

/// The headline differentiator: the per-quant tool-call composite as a single
/// line, e.g. "Q4_K_M 71% · Q8_0 88%". Skips quants with no score (null/absent)
/// so a backend error never shows a fabricated number.
export function toolcallSpread(
  variants: { name: string; quantization: string }[],
  scores: Record<string, number | null>,
): string | null {
  const parts = variants
    .filter((v) => typeof scores[v.name] === "number")
    .map((v) => `${v.quantization} ${Math.round((scores[v.name] as number) * 100)}%`);
  return parts.length ? parts.join(" · ") : null;
}

/// Per-quant tool-call delta vs the highest-quality scored quant (the baseline),
/// in percentage points — makes the quality lost to a smaller quant explicit
/// (e.g. Q4 "−17pp vs Q8_0"). Needs ≥2 scored quants; baseline row has no delta.
export function toolcallDelta(
  variants: { name: string; quantization: string }[],
  scores: Record<string, number | null>,
): { baseline: string | null; deltas: Record<string, number> } {
  const scored = variants.filter((v) => typeof scores[v.name] === "number");
  if (scored.length < 2) return { baseline: null, deltas: {} };
  const base = scored.reduce((a, b) => (quantRank(b.quantization) > quantRank(a.quantization) ? b : a));
  const baseScore = scores[base.name] as number;
  const deltas: Record<string, number> = {};
  for (const v of scored) {
    if (v.name === base.name) continue;
    deltas[v.name] = Math.round(((scores[v.name] as number) - baseScore) * 100);
  }
  return { baseline: base.quantization, deltas };
}

/// The Quant tab: pick a model that has several installed quantizations, and
/// compare them — recommendation, per-quant size/fit, eval quality (pass-rate),
/// and a hand-off to the Bench for speed/VRAM.
export function QuantPage() {
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const { snapshot } = useHardwareSnapshot();
  const setSelectedModels = useSelectedModelStore((s) => s.setSelectedModels);
  const globalModel = useSelectedModelStore((s) => s.selectedModels[0] ?? null);
  const goTo = useNavStore((s) => s.setTopView);
  const { scores, running, run } = useQuantEval();
  const toolcall = useQuantToolcall();
  const [usecase, setUsecase] = useState<UseCase>("quality-writing");
  const [groupKey, setGroupKey] = useState("");
  const [ctxLen, setCtxLen] = useState(8192);

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const groups = groupQuantVariants(list);

  // Seed the group from the global header model when it belongs to a quant group.
  useEffect(() => {
    if (groupKey || !globalModel) return;
    const g = groups.find((x) => x.variants.some((v) => v.name === globalModel.name));
    if (g) setGroupKey(g.key);
  }, [groupKey, globalModel, groups]);
  const group = groups.find((g) => g.key === groupKey) ?? groups[0] ?? null;
  // Cross-quant runs only work on Ollama (single-model llama.cpp/MLX can't
  // switch quants on one server). Size/fit/recommendation still work either way.
  const canCompare = !!group && group.variants.every((v) => servesModelsByName(v.backend));

  // KV-aware VRAM prediction: dims (Ollama /api/show) + KV bytes at the chosen
  // context. Same dims for all quants of one model, so fetch once for the group.
  const { dims, kvBytes } = useVramFit(group?.variants[0]?.name, group?.variants[0]?.backend, ctxLen);
  const avail = snapshot?.available_memory_bytes ?? 0;
  // Only gate on OOM when hardware is actually known; unknown memory must not block runs.
  const gated = !!snapshot && avail > 0;
  const ctxOptions = CTX_OPTIONS.filter((c) => !dims || c <= dims.context_length);
  const runnable = group ? group.variants.filter((v) => !(gated && predictFit(v.sizeBytes, kvBytes, avail).oom)) : [];
  const noneRunnable = !!group && runnable.length === 0;
  const rec = group ? recommendQuant(usecase, snapshot, group.variants, kvBytes) : null;
  const tcDelta = group ? toolcallDelta(group.variants, toolcall.scores) : { baseline: null, deltas: {} };

  const compareInBench = () => {
    if (!group) return;
    setSelectedModels(group.variants.map((v) => ({ name: v.name, backend: v.backend, size_bytes: v.sizeBytes })));
    goTo("workspace");
  };

  return (
    <div className="space-y-3" data-testid="quant-page">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Quantization Comparison</h2>
        <span className="ml-auto"><InfoButton {...QUANT_HELP.page} testId="quant" /></span>
      </div>
      <div className="flex gap-2 items-center">
        <select
          value={group?.key ?? ""}
          onChange={(e) => setGroupKey(e.target.value)}
          data-testid="quant-model-select"
          className="border rounded px-2 py-1 text-sm"
        >
          {groups.length === 0 && <option value="">No models with multiple quants installed</option>}
          {groups.map((g) => (
            <option key={g.key} value={g.key}>{g.key} ({g.variants.length})</option>
          ))}
        </select>
        <select
          value={usecase}
          onChange={(e) => setUsecase(e.target.value as UseCase)}
          data-testid="quant-usecase-select"
          className="border rounded px-2 py-1 text-sm"
        >
          {USE_CASES.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
        <select
          value={ctxLen}
          onChange={(e) => setCtxLen(Number(e.target.value))}
          data-testid="quant-ctx-select"
          className="border rounded px-2 py-1 text-sm"
          title="Context length — drives the KV-cache VRAM estimate"
        >
          {ctxOptions.map((c) => (
            <option key={c} value={c}>{ctxLabel(c)} ctx</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canCompare || running || noneRunnable}
          onClick={() => void run(runnable)}
          data-testid="quant-run-evals"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {running ? "Scoring…" : "Run quality evals"}
        </button>
        <button
          type="button"
          disabled={!canCompare || toolcall.running || noneRunnable}
          onClick={() => void toolcall.run(runnable)}
          data-testid="quant-run-toolcall"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {toolcall.running ? "Scoring…" : "Run tool-call evals"}
        </button>
        <button
          type="button"
          disabled={!canCompare}
          onClick={compareInBench}
          data-testid="quant-compare-bench"
          className="border rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          Compare in Workspace →
        </button>
      </div>

      {group && !canCompare && (
        <p data-testid="quant-ollama-only" className="text-xs text-amber-700">{QUANT_OLLAMA_ONLY_NOTE}</p>
      )}

      {rec?.pick && (
        <div data-testid="quant-recommendation" className="border rounded p-2 bg-blue-50 text-sm">
          <span className="font-medium">Recommended: {rec.pick.quantization}</span> — {rec.why}
        </div>
      )}
      {rec && !rec.pick && (
        <p data-testid="quant-no-rec" className="text-sm text-gray-600">{rec.why}</p>
      )}

      {group && toolcallSpread(group.variants, toolcall.scores) && (
        <p data-testid="quant-toolcall-spread" className="text-xs text-gray-700">
          <span className="text-gray-500">Tool-call spread: </span>
          {toolcallSpread(group.variants, toolcall.scores)}
          {tcDelta.baseline && <span className="text-gray-500"> · Δ vs {tcDelta.baseline}</span>}
        </p>
      )}

      {snapshot && (
        <p className="text-[11px] text-gray-500" data-testid="quant-bandwidth">
          {snapshot.estimated_bandwidth_gbps != null
            ? `Speed is memory-bandwidth-bound, not FLOPS-bound — ~${snapshot.estimated_bandwidth_gbps} GB/s.`
            : "Memory bandwidth: Not available."}
          {kvBytes != null && ` KV cache @ ${ctxLabel(ctxLen)} ctx ≈ ${formatBytes(kvBytes)}.`}
          {group && kvBytes == null && " VRAM fit is approximate — KV-aware fit needs Ollama."}
        </p>
      )}

      {group && (
        <table className="text-xs w-full border-collapse" data-testid="quant-table">
          <thead>
            <tr className="text-left text-gray-500">
              <th title={QUANT_COLUMN_HELP.Quant}>Quant</th>
              <th title={QUANT_COLUMN_HELP.Size}>Size</th>
              {snapshot && <th title={QUANT_COLUMN_HELP.Fit}>Fit</th>}
              <th title={QUANT_COLUMN_HELP.Quality}>Quality</th>
              <th title={QUANT_COLUMN_HELP["Tool-calls"]}>Tool-calls</th>
            </tr>
          </thead>
          <tbody>
            {group.variants.map((v) => {
              const p = snapshot ? predictFit(v.sizeBytes, kvBytes, avail) : null;
              const badge = p ? fitBadge(p.fit) : null;
              return (
                <tr key={v.name} className="border-t" data-testid={`quant-variant-${v.quantization}`}>
                  <td className="py-1 pr-2">{v.quantization}</td>
                  <td className="py-1 pr-2">{formatBytes(v.sizeBytes)}</td>
                  {p && badge && (
                    <td className={`py-1 pr-2 ${p.oom ? "text-red-600 font-medium" : badge.cls}`} data-testid={`quant-fit-${v.quantization}`}>
                      {p.oom ? "OOM Risk" : `${badge.text}${p.approx ? " ~" : ""}`}
                    </td>
                  )}
                  <td className="py-1 pr-2" data-testid={`quant-quality-${v.quantization}`}>
                    {qualityText(scores[v.name], running)}
                  </td>
                  <td className="py-1 pr-2" data-testid={`quant-toolcall-${v.quantization}`}>
                    {toolcallText(toolcall.scores[v.name], toolcall.running)}
                    {tcDelta.deltas[v.name] != null && (
                      <span
                        className={`ml-1 ${tcDelta.deltas[v.name] < 0 ? "text-red-600" : "text-green-600"}`}
                        data-testid={`quant-delta-${v.quantization}`}
                      >
                        ({tcDelta.deltas[v.name] > 0 ? "+" : ""}{tcDelta.deltas[v.name]}pp)
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
