const INCLUDED = [
  "Metrics — Pass^k, effort, avg steps",
  "Inference params — temperature, top-p/k, context, seed (only the ones you set)",
  "Hardware cohort tags (chip class, memory tier)",
  "Model name + quantization",
  "Integrity hash + signature",
];

const EXCLUDED = [
  "Task content & prompts",
  "File names & paths",
  "Raw model output / traces",
  "Anything beyond your GitHub handle",
];

/// The transparency panel: exactly what leaves the machine vs. what never does.
/// Excluded items are struck through so the privacy guarantee is visual, not just
/// textual — the one control that keeps a custom eval suite from leaking.
export function WhatsSharedPanel() {
  return (
    <div className="grid grid-cols-2 gap-4 text-xs" data-testid="whats-shared">
      <div>
        <div className="font-bold text-emerald-700 uppercase tracking-wide mb-1.5">Shared</div>
        <ul className="space-y-1 text-slate-700">
          {INCLUDED.map((s) => (
            <li key={s} data-testid="publish-included" className="flex gap-1.5">
              <span className="text-emerald-600">✓</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="font-bold text-slate-500 uppercase tracking-wide mb-1.5">Never shared</div>
        <ul className="space-y-1 text-slate-400">
          {EXCLUDED.map((s) => (
            <li key={s} data-testid="publish-excluded" className="flex gap-1.5 line-through">
              <span className="no-underline">✗</span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
