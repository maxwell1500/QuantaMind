import type { ReactNode } from "react";

/// In-app help for the Agent Readiness page — shown in hover InfoButtons so every
/// metric / control explains itself. One source of truth for the copy.
export const READINESS_HELP: Record<string, { title: string; body: ReactNode }> = {
  page: {
    title: "Local Agent Readiness Validator",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>
          Turns the batch you ran on the <b>Eval</b> tab into a transparent verdict per model: 🟢 Ready / 🟡 Conditional /
          🔴 NotReady, each with the exact reasons — never a black-box score.
        </span>
        <span>
          <b>Measured per model:</b> Pass^k (consistency), avg steps, effort (tokens to succeed), loop / hallucination
          counts, and VRAM fit. Scored against the selected <b>profile</b>’s thresholds.
        </span>
        <span>
          <b>How the verdict works:</b> a hard gate failing → NotReady (e.g. <i>pass^k 0.40 &lt; 0.80</i>); a soft target
          exceeded → Conditional; nothing failing → Ready. A required-but-unmeasured metric blocks — it never guesses.
        </span>
      </div>
    ),
  },
  nativeFc: {
    title: "Native Function-Calling (FC) path",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>
          <b>FC = Function Calling</b> (tool calling). A model can be tested two ways:
        </span>
        <span>
          • <b>Prompt-Based</b> — tool schemas in the system prompt; the model writes calls as text we parse. Works on any
          backend.
        </span>
        <span>
          • <b>Native FC</b> — the model’s dedicated tool API (Ollama <code>/api/chat</code> <code>tool_calls</code>). Ollama
          + tool-capable models only; llama.cpp / MLX show N/A.
        </span>
        <span>
          This toggle shows/hides natively-measured rows. When measured natively, the verdict uses the <b>native</b> Pass^k —
          the honest path a real agent uses (a model can pass the prompt proxy yet fail the native API).
        </span>
      </div>
    ),
  },
  vramCap: {
    title: "VRAM / RAM Allocation Cap",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>
          The memory budget VRAM-fit is checked against: model weights + the KV cache at your run’s context length must fit
          under this cap. Defaults to your detected memory.
        </span>
        <span>
          Lower it to simulate a tighter box (test headroom) and watch models flip to NotReady under a profile that requires a
          full fit. Options stop at your physical memory — you can’t allocate more than you have. In-session only; not saved.
        </span>
      </div>
    ),
  },
  profile: {
    title: "Target Use Case (profile)",
    body: (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>The thresholds the verdict is measured against — different agents need different bars:</span>
        <span>
          • <b>Coding agent</b> — strictest: high Pass^k, forbid loops/hallucinations, require a full VRAM fit (must be
          reliable + fast).
        </span>
        <span>
          • <b>RAG assistant</b> — reliability gates but offload-tolerant (VRAM fit off).
        </span>
        <span>
          • <b>General agent</b> — baseline.
        </span>
        <span>Edit any threshold with “Edit Profile Thresholds”; the verdict re-computes against your values.</span>
      </div>
    ),
  },
};
