export interface HelpSection { id: string; title: string; body: string[] }

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "first-run",
    title: "First run — getting Ollama up",
    body: [
      "QuantaMind drives Ollama as a local model runtime. If you don't see a model dropdown in the Workspace, the picker is showing a 'Ollama is not running' card with two buttons.",
      "Click 'Start Ollama' to launch the server in the background — it stays running even after you quit QuantaMind. Click 'Install Ollama' if the binary isn't on your machine; that opens ollama.com/download in your browser.",
      "Once Ollama is up, head to the Models tab to pull a model (try 'llama3.2:1b' for a quick first run, ~700 MB).",
    ],
  },
  {
    id: "workspace",
    title: "Workspace — single-model prompt + run",
    body: [
      "The gear (⚙) on the left of the model dropdown opens the temperature popover — drag the slider 0.0–2.0 to control sampling. Persists per-model.",
      "The square stop icon on the right of the dropdown kills the Ollama server. The red dot in the bottom status bar will flip immediately; click Refresh in the top bar or wait for the next health tick to re-confirm.",
      "Type into 'System prompt' (optional) and 'User prompt', then click Run. Tokens stream into the Output area. Big models show 'Loading model…' for up to ~30s before the first token.",
      "Cancel mid-stream stops generation; the metrics row shows time-to-first-token, tokens/s, and total token count.",
    ],
  },
  {
    id: "compare",
    title: "Compare — same prompt against multiple models",
    body: [
      "Select 2+ models in the picker, paste a prompt, choose a strategy, hit Run. Each row streams independently.",
      "Sequential: one model loaded at a time. QuantaMind sends keep_alive=0 so each model is evicted from RAM before the next one loads — best for big models on limited RAM.",
      "Sequential (skippable): same as sequential, but each row gets a Skip button so you can move on if a model is too slow.",
      "Parallel: all models loaded concurrently. Fastest wall-clock if you have the RAM. Each row shows its own loading spinner until its first token.",
      "Use the Export buttons to save the run as Markdown or JSON.",
    ],
  },
  {
    id: "models",
    title: "Models — install a new model three ways",
    body: [
      "Ollama Library: type any tag from ollama.com/library (link in the description opens it in your browser) and click Install. The pull streams a progress bar.",
      "Hugging Face: search for a GGUF repo, pick a quant from the file list, click Install. QuantaMind downloads + registers it with Ollama.",
      "Local File: pick a .gguf you already have on disk. QuantaMind generates the right Modelfile and creates the Ollama entry — no re-download.",
    ],
  },
  {
    id: "downloads",
    title: "Downloads — in-progress installs",
    body: [
      "Shows every active pull/HF download/local-install with its progress bar and phase (downloading, verifying, writing, success).",
      "Cancel a download to stop it cleanly; partial files are kept and resumed if you re-install with the same name.",
      "Once a download finishes successfully it disappears from here; the model appears in the Workspace dropdown and the Storage tab.",
    ],
  },
  {
    id: "storage",
    title: "Storage — installed models + disk usage",
    body: [
      "Lists every installed model with its size, quant, parameter count, and family. The header shows total Ollama footprint + free disk space.",
      "Uninstall removes the model from Ollama's storage (a confirmation dialog shows the bytes you'll free).",
      "The 'Model storage path' section shows where Ollama stores blobs (defaults to ~/.ollama/models). To move it, set OLLAMA_MODELS in your shell profile and restart Ollama — QuantaMind doesn't move blobs for you.",
    ],
  },
  {
    id: "controls",
    title: "Global controls — Refresh + Feedback",
    body: [
      "The Refresh button in the top bar re-runs the Ollama health probe + re-fetches installed models. Use it after starting/stopping Ollama externally so you don't have to wait 5s for the next automatic tick.",
      "The Feedback button bottom-right opens a modal; click 'Open in mail app' and your default email client launches a draft to info@quantamind.co. Check the Diagnostics box to include app version, OS, and current model in the body.",
      "The status bar shows the selected model name, an Ollama health indicator (green dot = connected, red = not running), and the last run's metrics.",
    ],
  },
  {
    id: "updates",
    title: "Updating QuantaMind",
    body: [
      "The card at the top of this Help tab is the in-app updater. Click 'Check for updates' and QuantaMind asks quantamind.co/releases/latest.json whether a newer version is available.",
      "If one is, the dialog shows the release notes and a 'Download and install' button. Click it; the new bundle is downloaded, signature-verified, installed, and the app relaunches into the new version.",
      "Macs without an Apple Developer signature show a Gatekeeper warning the first time after each install — right-click the app and pick Open. This goes away once we have notarization in place.",
    ],
  },
];
