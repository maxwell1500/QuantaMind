import { useCompareStore } from "../state/compareStore";
import { useModelLabel } from "../../models/hooks/useModelLabel";

const getShortName = (name: string) => {
  const clean = name.split(":")[0].split("-")[0].replace(/[^a-zA-Z0-9.]/g, ""); // e.g. llama3.2
  const match = clean.match(/([a-zA-Z]+)(\d+)?\.?(\d+)?/);
  if (!match) return name.substring(0, 4);
  const letters = match[1].substring(0, 3);
  const num = match[2] || "";
  return (letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() + num).substring(0, 4);
};

// Axis ticks derived from the data's own scale — aim for ~approxCount ticks
// rounded up to `round`. No hardcoded ceilings (no fabricated "hardware max").
const niceTicks = (limit: number, approxCount: number, round: number): number[] => {
  const step = Math.max(round, Math.ceil(limit / approxCount / round) * round);
  const ticks: number[] = [];
  for (let t = step; t <= limit + 0.001; t += step) ticks.push(t);
  return ticks;
};

type Val = { model: string; shortName: string; val: number | null };

export function MetricsChart() {
  const rows = useCompareStore((s) => s.rows);
  const label = useModelLabel();

  const doneRows = rows.filter((r) => r.status === "done" && r.metrics);
  if (doneRows.length === 0) return null;

  // Keep missing measurements as null — the backend sends null when a metric
  // was not measured; we must never render that as a real "0".
  const throughputVals: Val[] = doneRows.map((r) => ({
    model: r.model,
    shortName: getShortName(r.model),
    val: r.metrics?.tokens_per_sec ?? null,
  }));
  const maxThroughput = throughputVals.reduce((max, v) => (v.val != null ? Math.max(max, v.val) : max), 0);
  const throughputLimit = maxThroughput > 0 ? maxThroughput : 10;

  const ttftVals: Val[] = doneRows.map((r) => ({
    model: r.model,
    shortName: getShortName(r.model),
    val: r.metrics?.ttft_ms ?? null,
  }));
  const maxTtft = ttftVals.reduce((max, v) => (v.val != null ? Math.max(max, v.val) : max), 0);
  const ttftLimit = maxTtft > 0 ? maxTtft : 500;

  const totalChars = 50; // length of the progress bar in monospace characters
  const throughputTicks = niceTicks(throughputLimit, 8, 10);
  const ttftTicks = niceTicks(ttftLimit, 6, 500);

  // Diff is a derived delta over the two measured throughputs — skip it unless
  // at least two models actually reported a value (never diff against a null).
  let throughputDiffText = "";
  let throughputDiffIndex = 0;
  const measuredThroughput = throughputVals.filter((v): v is Val & { val: number } => v.val != null);
  if (measuredThroughput.length >= 2) {
    const v1 = measuredThroughput[0];
    const v2 = measuredThroughput[1];
    const diff = Math.abs(v1.val - v2.val);
    const leader = v1.val >= v2.val ? v1 : v2;
    throughputDiffText = `Diff: +${diff.toFixed(1)} tok/s (${label(leader.model)} leads)`;
    const minVal = Math.min(v1.val, v2.val);
    throughputDiffIndex = Math.min(totalChars, Math.round((minVal / throughputLimit) * totalChars));
  }

  return (
    <div
      className="space-y-6 border border-gray-100 rounded-lg p-5 bg-gray-50 font-mono text-xs select-none"
      data-testid="metrics-chart"
    >
      {/* ── THROUGHPUT (tok/s) ── */}
      <div data-testid="metrics-tokens_per_sec" className="space-y-1">
        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          THROUGHPUT (tok/s)
        </div>

        {/* Ticks Row */}
        <div className="relative h-4 text-gray-500 font-semibold text-[10px] w-full">
          <div className="absolute left-[5ch]" style={{ width: `${totalChars}ch` }}>
            {throughputTicks.map((tick) => (
              <span
                key={tick}
                className="absolute"
                style={{ left: `${(tick / throughputLimit) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}
              >
                │ {tick}
              </span>
            ))}
          </div>
        </div>

        {/* Bars */}
        <div className="space-y-1">
          {throughputVals.map((v) => {
            if (v.val == null) {
              return (
                <div key={v.model} className="flex items-center text-gray-400">
                  <span className="w-[5ch] font-bold text-gray-500">{v.shortName}</span>
                  <span className="italic">Not available</span>
                </div>
              );
            }
            const filledCount = Math.min(totalChars, Math.round((v.val / throughputLimit) * totalChars));
            return (
              <div key={v.model} className="flex items-center text-gray-700">
                <span className="w-[5ch] font-bold text-gray-500">{v.shortName}</span>
                <span className="text-green-600 font-bold select-none">
                  {"▓".repeat(filledCount)}
                </span>
                <span className="text-gray-500 font-semibold mx-1">▏</span>
                <span className="text-gray-900 font-semibold mr-2">{v.val.toFixed(1)} tok/s</span>
              </div>
            );
          })}
        </div>

        {/* Diff line */}
        {throughputDiffText && (
          <div className="flex text-[10px] text-gray-500">
            <span className="w-[5ch]" />
            <span>
              └
              {/* Line up to the diff index */}
              {"─".repeat(Math.max(1, throughputDiffIndex - 1))}
              <span className="text-green-600 font-bold">▲ {throughputDiffText}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── TIME TO FIRST TOKEN (TTFT) ── */}
      <div data-testid="metrics-ttft_ms" className="space-y-1">
        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          TIME TO FIRST TOKEN (TTFT)
        </div>

        {/* Ticks Row */}
        <div className="relative h-4 text-gray-500 font-semibold text-[10px] w-full">
          <div className="absolute left-[5ch]" style={{ width: `${totalChars}ch` }}>
            {ttftTicks.map((tick) => (
              <span
                key={tick}
                className="absolute"
                style={{ left: `${(tick / ttftLimit) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}
              >
                │ {tick}ms
              </span>
            ))}
          </div>
        </div>

        {/* Bars */}
        <div className="space-y-1">
          {ttftVals.map((v) => {
            if (v.val == null) {
              return (
                <div key={v.model} className="flex items-center text-gray-400">
                  <span className="w-[5ch] font-bold text-gray-500">{v.shortName}</span>
                  <span className="italic">Not available</span>
                </div>
              );
            }
            const filledCount = Math.min(totalChars, Math.round((v.val / ttftLimit) * totalChars));
            return (
              <div key={v.model} className="flex items-center text-gray-700">
                <span className="w-[5ch] font-bold text-gray-500">{v.shortName}</span>
                <span className="text-blue-600 font-bold select-none">
                  {"▓".repeat(filledCount)}
                </span>
                <span className="text-gray-500 font-semibold mx-1">▏</span>
                <span className="text-gray-900 font-semibold">{v.val.toFixed(0)} ms</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
