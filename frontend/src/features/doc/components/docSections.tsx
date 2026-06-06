import type { ReactNode } from "react";

/// One documented thing — a panel, a graph, a control, or a computed metric.
/// Every block answers the same three questions, so the page reads consistently
/// no matter which feature it describes. `formula`/`source` are for blocks whose
/// number is computed (the user can see exactly how it's derived and where).
export interface DocBlock {
  /// Anchor within a section (url hash → `#doc-<section>-<id>`).
  id: string;
  heading: string;
  what: ReactNode;
  why: ReactNode;
  how: ReactNode;
  /// A literal formula / algorithm, rendered monospace. Optional.
  formula?: string;
  /// Where the number is actually computed, e.g. a Rust file. Optional.
  source?: string;
}

/// One page of the app (or a cross-cutting topic), shown as a sidebar entry with
/// its blocks in the center pane.
export interface DocSection {
  /// Sidebar id + url hash (`#doc-<id>`).
  id: string;
  title: string;
  /// One-line summary under the section title.
  blurb: string;
  blocks: DocBlock[];
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "workspace",
    title: "Workspace",
    blurb: "Your home base — pick a model, write a prompt, run it, watch tokens stream.",
    blocks: [
      {
        id: "first-run",
        heading: "First run — getting Ollama up",
        what: "On a fresh machine the model dropdown is replaced by an “Ollama is not running” card with Start Ollama and Install Ollama buttons.",
        why: "QuantaMind doesn’t ship its own model runtime — it drives Ollama, a local server, so your models and weights stay on your machine and nothing is sent to the cloud.",
        how: "“Start Ollama” launches the server in the background (it keeps running after you quit QuantaMind). “Install Ollama” opens ollama.com/download. Once it’s up, the Models tab lets you pull a model — try llama3.2:1b (~700 MB) for a quick first run.",
      },
      {
        id: "model-select",
        heading: "Model picker + temperature + stop",
        what: "The bar at the top: a model dropdown, a gear (⚙) on its left, and a square stop icon on its right.",
        why: "Everything the app does runs against the globally-selected model, so this selection is the one knob the whole app reads — there’s no per-page model choice to keep in sync.",
        how: "The gear opens a temperature popover (0.0–2.0, persisted per model). The stop icon kills the Ollama server — the health dot in the status bar flips to red immediately. For Ollama you can multi-select 2+ models, which turns the run into a Compare (see Analysis).",
      },
      {
        id: "prompts",
        heading: "System + user prompt, Run, and streaming",
        what: "Two editors — an optional System prompt and the User prompt — plus a Run button. Output streams into the panel below.",
        why: "Separating system from user prompt mirrors how the model is actually called, so what you test here matches what your app will send in production.",
        how: "Run streams tokens as they’re generated. A large model shows “Loading model…” for up to ~30s before the first token (the weights load into RAM/VRAM). Cancel mid-stream stops generation cleanly and keeps whatever was produced.",
      },
      {
        id: "run-metrics",
        heading: "Run metrics (TTFT · tokens/s · token count)",
        what: "After a run the metrics row shows time-to-first-token, throughput, and total tokens.",
        why: "These three numbers are the headline of local-model performance: how long until it starts, how fast it sustains, and how much it produced. They’re measured, never estimated.",
        how: "TTFT is the wall-clock from request to the first streamed token. Throughput is generated-token-count ÷ generation-seconds. Token counts come from the backend’s own counters (prompt_eval_count / eval_count), not a chars÷4 guess.",
        formula: "ttft_ms = first_token_time − request_start\ntokens_per_sec = eval_count ÷ generation_seconds",
        source: "backend/src/metrics/timing.rs",
      },
      {
        id: "templates",
        heading: "Prompt template picker",
        what: "A picker that inserts a ready-made prompt skeleton into the User prompt box.",
        why: "Common tasks (summarize, extract JSON, tool-call) have a known-good prompt shape; starting from one saves you re-deriving it and makes runs comparable.",
        how: "Templates are bundled app assets under docs/prompts/; selecting one pastes its text at the cursor — you then edit freely.",
      },
    ],
  },
  {
    id: "global",
    title: "Global controls & updates",
    blurb: "The status bar, Refresh, Feedback, workspaces, and the in-app updater.",
    blocks: [
      {
        id: "status-bar",
        heading: "Status bar + Ollama health",
        what: "The footer shows the selected model, a health dot (green = Ollama connected, red = not running), and the last run’s metrics.",
        why: "The runtime can be started/stopped outside the app; a persistent indicator means you always know whether a run will even reach a server.",
        how: "A background health probe polls Ollama on a timer; the dot reflects the latest tick. Stopping the server flips it red at once; starting it goes green on the next tick (or immediately if you hit Refresh).",
      },
      {
        id: "refresh",
        heading: "Refresh",
        what: "The top-bar Refresh button re-runs the Ollama health probe and re-fetches the installed-model list.",
        why: "When you start or stop Ollama (or install a model) from outside QuantaMind, the app shouldn’t make you wait for the next automatic poll to catch up.",
        how: "It triggers the same probe + model-list fetch the app runs on a timer, on demand.",
      },
      {
        id: "workspaces",
        heading: "Workspaces (left rail)",
        what: "The Workspace tab has a left rail of named workspaces; each remembers its own prompts and selection.",
        why: "You usually juggle several lines of investigation; separate workspaces keep their state from bleeding into each other and auto-save as you go.",
        how: "Switching workspaces swaps the saved prompt/selection state; edits auto-save so nothing is lost between switches or restarts.",
      },
      {
        id: "feedback",
        heading: "Feedback button",
        what: "A bottom-right button opens a modal that drafts an email to the team.",
        why: "The fastest way to report something wrong in the app — including the context needed to reproduce it — without leaving your flow.",
        how: "“Open in mail app” launches your default client with a draft to info@quantamind.co. Tick Diagnostics to include app version, OS, and current model in the body.",
      },
      {
        id: "updates",
        heading: "Updating QuantaMind",
        what: "The updater card (top of this page) checks for and installs new versions.",
        why: "Desktop apps don’t auto-update through a store here, so the app checks a release feed itself and can install in place.",
        how: "“Check for updates” asks quantamind.co/releases/latest.json. If a newer version exists, the dialog shows release notes and a Download-and-install button that fetches the bundle, signature-verifies it, installs, and relaunches. Unsigned macOS builds show a Gatekeeper prompt the first time — right-click → Open.",
      },
    ],
  },
];
