/// In-app help copy for the Quant page tool + its table columns.

export interface Help {
  title: string;
  body: string;
}

export const QUANT_HELP = {
  page: {
    title: "Quantization Comparison",
    body: "Pick a model you've installed in several quantizations and compare them side by side — file size, memory fit at the chosen context, quality (eval pass-rate) and tool-call accuracy — so you can choose the smallest quant that's still good enough. Cross-quant quality/tool-call runs need Ollama; size and fit work on any backend.",
  },
} satisfies Record<string, Help>;

/// "Title — body" tooltips for the table column headers.
export const QUANT_COLUMN_HELP: Record<string, string> = {
  Quant: "Quantization level (e.g. Q4_K_M) — fewer bits per weight means a smaller, faster, slightly less accurate model.",
  Size: "On-disk size of this quant's weights.",
  Fit: "Whether base weights + the KV cache at the chosen context fit in available memory. 'OOM Risk' means it likely won't; '~' marks an approximate estimate (non-Ollama).",
  Quality: "Eval quality as passed/total on the quality suite — run 'Run quality evals' to fill it.",
  "Tool-calls": "Tool-call composite accuracy (%) — run 'Run tool-call evals' to fill it. The headline differentiator between quants.",
};
