/// In-app help copy for the Eval/Audit tools and metrics — a single source of
/// truth so the same explanation appears wherever a metric is shown (the Eval
/// Performance Matrix tooltips and the Audit history popup).

export interface Help {
  title: string;
  body: string;
}

/// What each tool does / when to use it / how it scores. Shown in an InfoButton.
export const TOOL_HELP = {
  evalManager: {
    title: "Eval Manager",
    body: "Pick a collection (a built-in suite or your own), choose which models to test, set Iterations (k) and Max Steps, then run the batch. This is the control panel — it doesn't score anything itself; it dispatches the run that fills the Simulator and Performance Matrix.",
  },
  simulator: {
    title: "The Simulator (Batch Scoreboard)",
    body: "A live grid of every model × task as the batch runs: each cell turns pass/fail the moment that task finishes. Use it to watch progress and spot which tasks a model struggles with. Click a cell to open that task in the Evaluator below.",
  },
  evaluator: {
    title: "The Evaluator (Single-Task Pipeline Debugger)",
    body: "Drill into ONE task end-to-end: the exact system prompt sent, the model's raw output, the tool call parsed from it, and the verdict (parsed? right tool? right args?). Use it when a cell failed and you need to see why — the eval is never a black box.",
  },
  performanceMatrix: {
    title: "LLM Performance Matrix",
    body: "Per-model summary of the last run — Pass^k, Avg Steps, Effort and the Top error for each model. Click a row to focus that model in the Simulator/Evaluator. Hover a column header for what it measures.",
  },
  auditHistory: {
    title: "Saved Matrix History",
    body: "A regression timeline of past batch runs for this collection — each model's pass-rate / composite over consecutive runs, so you can catch when a model (or a prompt change) regresses. Hover a point for its run number and score. It tracks the same metrics the Eval Performance Matrix reports: Pass^k (consistency), Effort (tokens to succeed), and the dominant Top error.",
  },
  contextCliff: {
    title: "Context-Cliff Diagnostic Probe",
    body: "Runs the chosen dataset at growing prompt lengths and graphs where tool-call accuracy collapses — the 'context cliff'. Use it to find a model's usable context window for tool use. Padding is approximate (≈tokens), so the depth is indicative, not a tokenizer count.",
  },
} satisfies Record<string, Help>;

/// How each metric is computed. Used both in InfoButtons and as native title=
/// tooltips on the dense metric labels.
export const METRIC_HELP = {
  passK: {
    title: "Pass^k",
    body: "Reliability across repeats: passes ÷ total runs when each agentic task is run k times. Higher = more consistent. For single-turn tasks it's the composite accuracy instead.",
  },
  avgSteps: {
    title: "Avg Steps",
    body: "Mean number of agentic turns (tool calls) a model took to finish a task. Lower is leaner; single-turn tasks have no steps (—).",
  },
  effort: {
    title: "Effort",
    body: "Mean output tokens on the runs that SUCCEEDED — the token cost of getting it right. Failed runs are excluded so a model isn't rewarded for giving up early.",
  },
  topError: {
    title: "Top error",
    body: "The model's dominant agentic failure mode across the collection: Loop Cap (hit the step limit), Fake Done (claimed success without the end-state), Bad Schema (burned its recovery budget on schema-invalid calls), or Malformed (unparseable tool JSON). 'None' means no failures dominated. Hover the ⓘ next to the badge for the full count of all four modes.",
  },
  schemaResil: {
    title: "Schema resilience",
    body: "Of the runs that hit a semantic schema error (missing/typed-wrong param), the share that recovered — emitted a valid call after the injected correction. '—' means no run ever hit one, so the metric didn't apply.",
  },
  cliffDepth: {
    title: "Cliff depth",
    body: "The measured context length (real prompt tokens) at which this model's accuracy collapses, from the Context-Cliff probe in the Audit tab. It feeds the Agent-Readiness verdict (a model that breaks down before your app's context needs is downgraded). 'Run probe ↗' until measured; '✓ no cliff' means it was probed and accuracy held the whole tested range.",
  },
  passRate: {
    title: "Pass rate",
    body: "Aggregate passes ÷ total runs across the whole collection, as a percentage.",
  },
} satisfies Record<string, Help>;

/// "Title — body" for a native title= tooltip on a metric label.
export function metricTitle(key: keyof typeof METRIC_HELP): string {
  const h = METRIC_HELP[key];
  return `${h.title} — ${h.body}`;
}
