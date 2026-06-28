# llama.cpp chat-template overrides

Drop a Jinja chat-template file here (or in your user config dir) to **override**
the chat template a llama.cpp model uses at launch. This is only needed when a
model's *embedded* GGUF template is broken (e.g. some DeepSeek-R1 / Qwen3 quants).
For every other model the default is the GGUF's own embedded template, applied
via `--jinja` — you do **not** need a file here.

## How it works

When QuantaMind starts `llama-server` for a model, it looks for a matching
`.jinja` override and, if found, passes it as `--chat-template-file <path>`.
Resolution tries the most specific key first:

1. `<model-file-stem>.jinja` — the GGUF file name without `.gguf`
   (e.g. `DeepSeek-R1-Distill-Qwen-7B-Q5_K_M.jinja`).
2. `<architecture>.jinja` — the GGUF's architecture string
   (e.g. `deepseek2.jinja`, `qwen3.jinja`, `gemma3.jinja`) — fixes a whole family
   with one file.

No match → the embedded template via `--jinja` (the default).

## Where files can live

- **User overrides** (highest priority): `chat_templates/` under the app config
  dir — e.g. macOS `~/Library/Application Support/QuantaMind/chat_templates/`.
  A user file shadows a bundled one of the same name.
- **Bundled defaults**: this directory, shipped with the app.

Add or remove a file and restart the model — no rebuild, no backend changes. The
app lists what's available via the `list_chat_templates` command.

## Authoring

Use a llama.cpp-compatible Jinja chat template (the same format llama.cpp's
`--chat-template-file` expects). Verify it against your model with a real run
before relying on it — a wrong template can reintroduce the no-EOS runaway it's
meant to fix.
