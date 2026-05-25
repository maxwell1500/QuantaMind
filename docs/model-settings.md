# Per-model settings

Each installed model has its own user-tunable settings, persisted to disk
and applied automatically on every inference run.

## What's tunable

| Setting | Range | Default | Effect |
| --- | --- | --- | --- |
| `temperature` | 0.0 – 2.0 | 0.7 | Passed to Ollama as `options.temperature`. Lower = more deterministic, higher = more chaotic. |

The default matches the shipped default of most Ollama models. Users
typically only touch it when they need either deterministic output
(0.0–0.2 for code/factual prompts) or higher creativity (1.2+).

## Where the UI lives

Workspace → ModelPicker → gear icon to the right of the dropdown opens a
popover with the slider. The popover closes on outside click or Esc. The
gear is disabled when no model is selected.

The same persisted value is used for both the single-model workspace
(`run_prompt`) and the multi-model compare view (`run_compare`). If a
user sets `mistral:7b` to 1.4, every run of that model — single or as
part of a compare — honors 1.4.

## On-disk format

YAML map at `<app_config_dir>/model_settings.yaml`:

```yaml
mistral:7b:
  temperature: 1.4
llama3.2:1b:
  temperature: 0.0
```

Missing file → empty map (every model uses the default). Empty file
→ same. Unknown model → returns the default at read time.

## Code map

| Concern | File |
| --- | --- |
| File I/O (load/save) | `backend/src/persistence/model_settings.rs` |
| In-memory state + commands + validation | `backend/src/commands/model_settings.rs` |
| Inference request shape (`options.temperature`) | `backend/src/inference/ollama.rs` |
| `run_prompt` lookup | `backend/src/commands/prompt.rs` |
| `run_compare` lookup (per row) | `backend/src/commands/compare.rs` + `inference/compare_runner.rs::rows_for` |
| IPC wrapper + Zod schema | `frontend/src/shared/ipc/model_settings.ts` |
| Zustand store | `frontend/src/features/models/state/modelSettingsStore.ts` |
| Popover UI | `frontend/src/features/workspace/components/ModelTemperaturePopover.tsx` |

## Adding another setting later

To add e.g. `top_p`:

1. Extend `ModelSettings` in `persistence/model_settings.rs`.
2. Add a `set_model_top_p` command alongside `set_model_temperature`,
   validating range.
3. Extend `GenerateOptions` in `inference/ollama.rs`.
4. Plumb through `run_prompt_inner` and `RowSpec`.
5. Extend the Zod schema and add a slider row to the popover.

Each step lives in one file. None should grow past the 100-line cap.
