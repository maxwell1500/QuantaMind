# Inference parameters

Each prompt carries its own inference knobs, stored inline in its
`*.quantamind.yaml` (`params:` block) and persisted per-prompt — not
globally. Unset knobs fall back to Ollama's own defaults; an unset
temperature falls back to the per-model setting from v0.1.

## The six knobs

| Knob | Range | Default | Ollama field | Effect |
| --- | --- | --- | --- | --- |
| temperature | 0.0–2.0 | 0.7* | `temperature` | Randomness. 0 = deterministic. |
| top_p | 0.0–1.0 | 0.9 | `top_p` | Nucleus sampling cutoff. |
| top_k | 0–100 | 40 | `top_k` | Sample from K likeliest tokens; 0 disables. |
| max_tokens | 0–4096 | unlimited | `num_predict` | Cap on generated tokens. |
| repeat_penalty | 0.0–2.0 | 1.1 | `repeat_penalty` | >1 discourages repetition. |
| seed | any int | random | `seed` | Fixed seed = reproducible output. |

\* temperature default comes from the per-model setting
(`model_settings.yaml`), not a hardcoded 0.7, when the prompt leaves it
unset.

## Live-edit semantics

Editing a knob during a run does **not** mutate the in-flight request.
The ParamsPanel shows an "applies on next run" badge while a run is in
progress; the new values take effect the next time you Run.

## Where it lives

| Concern | File |
| --- | --- |
| Param schema (persisted) | `backend/src/persistence/prompts/schema.rs` (`InferenceParams`) |
| Validation + params→options mapping | `backend/src/commands/prompt_options.rs` |
| Ollama request `options` block | `backend/src/inference/ollama.rs` (`GenerateOptions`) |
| Command wiring + temperature fallback | `backend/src/commands/prompt.rs` |
| UI panel | `frontend/src/features/workspace/components/ParamsPanel.tsx` + `ParamRow.tsx` |
| Tooltip copy + ranges | `frontend/src/features/workspace/components/paramsInfo.ts` |
| Run wiring (sends `params`) | `frontend/src/features/workspace/hooks/useStreamingRun.ts` |

`max_tokens` maps to Ollama's `num_predict`. Empty `params` sends no
`options` key at all, preserving v0.1 request shape.

## Verification

- `backend/tests/ollama_stream.rs::options_block_carries_all_params` —
  asserts every knob reaches the `/api/generate` body.
- `backend/tests/ollama_stream.rs::empty_options_omits_the_options_key` —
  asserts the v0.1 request shape is unchanged when no params are set.
- Live check (pending GUI): seed=42 twice → identical output;
  temperature=0 → deterministic; max_tokens=5 → truncated output.
