# Troubleshooting

Error states in QuantaMind aim to tell you *what* broke and *what to do
next*. Every run-path error renders an `ErrorCard` (title + helpful body
+ a primary action, and a "Learn more" link to the relevant section
here). Error copy is classified in
`frontend/src/shared/ipc/errorInfo.ts`; the card lives in
`frontend/src/shared/ui/ErrorCard.tsx`.

The anchors below match the `learnMore` links the classifier emits.

## Ollama not running {#ollama-not-running}

QuantaMind talks to a local Ollama server at `localhost:11434`. If it
isn't running you'll see "Ollama isn't running".

- Click **Start Ollama** in the model picker's empty state (macOS), or
  run `ollama serve` in a terminal.
- Confirm it's up: `curl http://localhost:11434/api/tags` should return
  JSON.
- On Windows/Linux, launch the Ollama app/service manually — in-app
  start is macOS-only in this release.

## Model not installed {#model-not-found}

"That model isn't installed" means Ollama doesn't have the model you
asked to run.

- Open the **Models** tab and pull it (Ollama library, HuggingFace, or a
  local GGUF).
- Names are exact, including the tag: `llama3.2:1b`, not `llama3.2`.

## Out of memory {#out-of-memory}

"Not enough memory for this model" means the model didn't fit in
available RAM/VRAM.

- Pick a smaller parameter size (e.g. 1B/3B instead of 7B/13B) or a more
  aggressive quantization (Q4 instead of Q8) in the Models tab.
- Close other memory-heavy apps.
- In Compare, prefer the sequential strategy so only one model loads at a
  time.

## Timeouts {#timeouts}

"The request timed out" usually means a large model is still loading its
weights on first use.

- Wait a few seconds and click **Retry** — first load of a multi-GB model
  can take 10–30s.
- If it persists, the model may be too large for this machine; see
  [out of memory](#out-of-memory).

## Reporting something else

Use the in-app **Feedback** button (bottom-right). Tick "Include
diagnostic info" so we get your app version, OS, and current model.
