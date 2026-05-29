# Analysis / Benchmark Document Schema — v1

> **Reference document. Intentionally exceeds the 100-line rule (CLAUDE.md #3).**
> This is a canonical schema reference (full JSON example + JSON Schema), not a
> code module — it is kept whole on purpose so the format reads as one unit.
> Do not split or trim it to satisfy the line limit.

## Status

Phase 3 Step 3.8's export (`frontend/src/features/compare/format/buildReport.ts`)
now emits this format as a **populated subset**: `document_type:"bench-report"`,
`schema_version:"1.0.0"`, with `environment`/`models`/`prompts`/`runs`/
`reproducibility` filled from whatever data we currently have and every other
field omitted (the schema keeps them optional). `findings`/`verdicts` stay empty
for app-generated reports. The remaining gaps (CPU/OS/GPU detail, per-run
parameters, `parameter_count`, `author`/provenance, ULID monotonicity) fill in
as the app gains that data; nothing here blocks a later, richer pass.

## What this schema is

One schema covers two artifacts, the report being a special case of the analysis:

- **Bench report** (`document_type: "bench-report"`) — "I ran prompt X against
  models A, B, C on my hardware; here are outputs + metrics." One snapshot;
  `runs` filled, `findings`/`verdicts` empty. This is what 3.8 generates.
- **Community analysis** (`document_type: "analysis"`) — a broader investigation:
  many prompts, many models, narrative + opinions. Fills `findings` and
  `verdicts` too.

They are the **same** schema so a bench report can be reshared as a building
block of a bigger analysis, and submissions can be aggregated.

## Design principles

- **Versioned from day one** — every document declares `schema_version`
  (semver string, e.g. `"1.0.0"`) so future parsers branch cleanly.
- **Hardware + software environment are first-class** — a metric without an
  environment is unfalsifiable. `environment` is required.
- **Outputs denormalized with their prompts** — don't normalize prompts into a
  side table; a fork that edits one prompt stays internally consistent.
- **Metrics are nullable** — cloud models have no local VRAM; some backends
  don't expose KV-cache size. `null` = "not measured" (distinct from `0`).
- **Provenance optional in v1** — `author`/signature/submitted-at matter for a
  community but must not block app-generated reports without a signed-in
  identity. Optional now; could become required in a v2.
- **Verdicts/observations separate from raw data** — opinions live in structured
  `findings`/`verdicts`, never mixed into `runs`. Tooling can render objective
  (outputs only) or opinionated (outputs + findings) views.
- **Reproducibility included even when imperfect** — recording seed/temperature/
  params makes "I couldn't reproduce" debuggable. First-class section.
- **IDs are ULIDs** (`document_id`, `run.id`) — time-sortable, unlike UUIDs.
- **Model id convention** `model.{family}_{params}.{quant}` — human-readable;
  `source.digest` (SHA256) disambiguates same-name/different-weights collisions.
- **Outputs verbatim** — `output.text` is complete, not truncated/normalized;
  the point is that others can fact-check what the model actually said.
- **Multi-dimensional 1–5 verdict scores**, not one fake-precise overall number;
  consumers must tolerate unknown score keys (dimensions can grow).

## Example document

```json
{
  "schema_version": "1.0.0",
  "document_id": "01HZX5K9P7QYTM3JN8WF6BAE2D",
  "document_type": "analysis",
  "title": "Llama 3.2 3B vs Qwen 2.5 7B on a 16GB Mac mini",
  "summary": "Four prompts, two models, focused on practical developer workflows. Key finding: the smaller model was the more reliable on long-context recall.",
  "created_at": "2026-06-08T14:22:00Z",
  "updated_at": "2026-06-08T14:22:00Z",
  "author": {
    "name": "Dhanush",
    "handle": "@quantamind",
    "url": "https://quantamind.co",
    "verified": false
  },
  "license": "CC-BY-4.0",
  "tags": ["mac-mini", "consumer-hardware", "small-models", "long-context"],
  "environment": {
    "os": {
      "name": "macOS",
      "version": "15.4",
      "kernel": "Darwin 24.4.0"
    },
    "cpu": {
      "vendor": "Apple",
      "model": "Apple M2",
      "cores_physical": 8,
      "cores_logical": 8
    },
    "gpu": {
      "vendor": "Apple",
      "model": "Apple M2 integrated GPU",
      "vram_bytes": null,
      "unified_memory": true
    },
    "memory": {
      "total_bytes": 17179869184,
      "available_bytes_at_start": 9000000000
    },
    "quantamind": {
      "version": "0.3.0",
      "commit": "a1b2c3d"
    },
    "runtimes": [
      {
        "name": "ollama",
        "version": "0.4.2",
        "endpoint": "http://localhost:11434"
      }
    ]
  },
  "models": [
    {
      "id": "model.llama3.2_3b.q4_k_m",
      "name": "llama3.2:3b",
      "display_name": "Llama 3.2 3B Instruct",
      "family": "llama",
      "parameter_count": 3200000000,
      "quantization": "Q4_K_M",
      "size_bytes": 2019377766,
      "source": {
        "type": "ollama_library",
        "registry": "ollama.com/library",
        "digest": "sha256:baf6a787fdff..."
      },
      "backend": "ollama",
      "context_length": 4096,
      "chat_template": "llama-3"
    },
    {
      "id": "model.qwen2.5_7b.q4_k_m",
      "name": "qwen2.5:7b",
      "display_name": "Qwen 2.5 7B Instruct",
      "family": "qwen2",
      "parameter_count": 7600000000,
      "quantization": "Q4_K_M",
      "size_bytes": 4683076608,
      "source": {
        "type": "ollama_library",
        "registry": "ollama.com/library",
        "digest": "sha256:8b4a..."
      },
      "backend": "ollama",
      "context_length": 32768,
      "chat_template": "qwen-2"
    }
  ],
  "prompts": [
    {
      "id": "prompt.code_review_division",
      "name": "Code review — empty list division",
      "category": "code-review",
      "system_prompt": "You are a senior software engineer doing a code review. Be concise and direct.",
      "user_prompt": "Review this Python function for bugs or issues:\n\ndef calculate_average(numbers):\n    total = 0\n    for n in numbers:\n        total += n\n    return total / len(numbers)",
      "context_window_tokens": null,
      "expected_behavior": "Should identify division-by-zero when an empty list is passed.",
      "evaluation_criteria": [
        "Catches division by zero",
        "Suggests a clean fix",
        "Avoids inventing problems that don't exist"
      ]
    },
    {
      "id": "prompt.long_context_recall",
      "name": "Long-context recall — research paper",
      "category": "long-context",
      "system_prompt": "You answer questions based only on the provided document.",
      "user_prompt": "<full document text here, possibly thousands of tokens>",
      "context_window_tokens": 7200,
      "expected_behavior": "Should retrieve the figure 450,000 cubic meters and decline questions about content not in the document.",
      "evaluation_criteria": [
        "Recalls the exact number",
        "Refuses to fabricate when asked about missing content"
      ]
    }
  ],
  "runs": [
    {
      "id": "run.01HZX5KA1B7C9D2E4F6G8H0J2K",
      "prompt_id": "prompt.code_review_division",
      "model_id": "model.llama3.2_3b.q4_k_m",
      "started_at": "2026-06-08T14:11:03.124Z",
      "completed_at": "2026-06-08T14:11:13.871Z",
      "status": "completed",
      "parameters": {
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "max_tokens": 1024,
        "seed": null,
        "repeat_penalty": 1.1,
        "stop": []
      },
      "metrics": {
        "ttft_ms": 2904,
        "tokens_per_second": 38.7,
        "total_tokens_generated": 415,
        "total_prompt_tokens": 87,
        "wall_clock_ms": 10747,
        "prompt_eval_ms": 2820,
        "prompt_eval_tokens_per_second": 30.8,
        "vram_allocated_bytes": null,
        "kv_cache_bytes": null,
        "peak_resident_memory_bytes": 2200000000
      },
      "output": {
        "text": "<full model output verbatim>",
        "stop_reason": "end_of_text",
        "truncated": false
      },
      "warnings": [],
      "errors": []
    },
    {
      "id": "run.01HZX5KA1B7C9D2E4F6G8H0J3L",
      "prompt_id": "prompt.long_context_recall",
      "model_id": "model.qwen2.5_7b.q4_k_m",
      "started_at": "2026-06-08T14:15:00.000Z",
      "completed_at": "2026-06-08T14:20:11.500Z",
      "status": "completed",
      "parameters": {
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "max_tokens": 1024,
        "seed": null,
        "repeat_penalty": 1.1,
        "stop": []
      },
      "metrics": {
        "ttft_ms": 295116,
        "tokens_per_second": 9.9,
        "total_tokens_generated": 508,
        "total_prompt_tokens": 7180,
        "wall_clock_ms": 311500,
        "prompt_eval_ms": 290000,
        "prompt_eval_tokens_per_second": 24.7,
        "vram_allocated_bytes": null,
        "kv_cache_bytes": null,
        "peak_resident_memory_bytes": 6200000000
      },
      "output": {
        "text": "<full model output verbatim>",
        "stop_reason": "end_of_text",
        "truncated": false
      },
      "warnings": [
        "ttft_ms unusually high — likely hardware memory pressure"
      ],
      "errors": []
    }
  ],
  "findings": [
    {
      "id": "finding.qwen_unusable_at_16gb",
      "type": "performance",
      "severity": "high",
      "related_model_ids": ["model.qwen2.5_7b.q4_k_m"],
      "related_run_ids": ["run.01HZX5KA1B7C9D2E4F6G8H0J3L"],
      "title": "Qwen 2.5 7B is functionally unusable on 16GB consumer hardware",
      "description": "Time to first token exceeded 4 minutes for a 7,200-token prompt. The model appears to be paging or memory-thrashing. On the same hardware, the 3B model handled the same prompt in under 20 seconds TTFT.",
      "evidence": "TTFT of 295,116ms vs the 3B model's 17,662ms on identical input."
    },
    {
      "id": "finding.smallest_model_most_accurate",
      "type": "quality",
      "severity": "high",
      "related_model_ids": ["model.llama3.2_3b.q4_k_m"],
      "related_run_ids": ["run.01HZX5KA1B7C9D2E4F6G8H0J2K"],
      "title": "Smallest model gave the most accurate long-context recall",
      "description": "On the long-context recall question, the 3B model correctly retrieved the exact number from the document. The 7B Mistral model on the same prompt confidently fabricated a different number.",
      "evidence": "Document contained '450,000 cubic meters'; 3B answered 450,000; comparison 7B answered 540,000."
    }
  ],
  "verdicts": [
    {
      "model_id": "model.llama3.2_3b.q4_k_m",
      "recommendation": "daily-driver",
      "reasoning": "Fastest, most reliable on reasoning and long-context recall, fits comfortably in 16GB.",
      "scores": {
        "speed": 5,
        "reliability": 5,
        "structured_output": 3,
        "long_context": 4,
        "code_generation": 3
      }
    },
    {
      "model_id": "model.qwen2.5_7b.q4_k_m",
      "recommendation": "avoid-on-16gb",
      "reasoning": "Theoretically capable but practically unusable on this hardware due to memory pressure.",
      "scores": {
        "speed": 1,
        "reliability": 4,
        "structured_output": 3,
        "long_context": 3,
        "code_generation": 4
      }
    }
  ],
  "reproducibility": {
    "deterministic": false,
    "seed_strategy": "default-random",
    "notes": "Runs are not deterministic. Re-running with the same seed will reduce variance but Ollama does not currently expose seed control through the standard generate endpoint."
  },
  "links": {
    "blog_post": "https://quantamind.co/blog/four-models-on-a-mac-mini",
    "github_discussion": null,
    "raw_outputs_archive": null
  }
}
```

## Format notes that matter more than the field list

- **ULIDs, not UUIDs**, for `document_id` / `run.id` — time-sortable storage.
- **Model `id` is human-readable** (`model.{family}_{params}.{quant}`);
  `source.digest` disambiguates two sources of the "same" model.
- **`null` vs `0` in `metrics`** — `vram_allocated_bytes: null` = not measured;
  tooling must render "not available", never "0 MB". Cloud/older backends return
  null for several fields.
- **`output.text` is verbatim and complete** — no truncation/whitespace
  stripping/unicode normalization. If too large for transport, paginate or
  compress — never lossy-encode the model's speech.
- **`findings`/`verdicts` are optional and separate** — a raw bench report emits
  `runs` only; an analysis fills the rest. Same schema, both ends of the range.
- **`reproducibility` is first-class**, not an afterthought — honest info (even
  "not deterministic, here's why") is what makes a submission trustworthy.
- **`verdicts.scores` are 1–5 per dimension**, never one overall number.

## Deliberately left out (add only in a future schema version)

- No token-level data / log-probs / embeddings (100× larger; future optional
  `runs[].output.token_log_probs`).
- No automatic quality scoring (BLEU etc.) — quality is human-judged in
  `verdicts`; implying machine rigor the data lacks would be dishonest.
- No document-level "winner" — privileges one dimension; let consumers aggregate
  `verdicts` if they want.
- No social metadata (views/upvotes/comments) — those belong in a community
  platform's DB, not the document.

## JSON Schema skeleton (validate before accepting submissions)

Fix the **outer** shape now; expand the per-type `$defs` when the exporter is
aligned. Inner shapes can be added without breaking existing documents.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://quantamind.co/schemas/analysis-v1.json",
  "title": "Quantamind Analysis Document",
  "type": "object",
  "required": [
    "schema_version",
    "document_id",
    "document_type",
    "title",
    "created_at",
    "environment",
    "models",
    "prompts",
    "runs"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$"
    },
    "document_id": {
      "type": "string",
      "minLength": 26,
      "maxLength": 26
    },
    "document_type": {
      "type": "string",
      "enum": ["bench-report", "analysis"]
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "summary": { "type": "string" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "author": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "handle": { "type": "string" },
        "url": { "type": "string", "format": "uri" },
        "verified": { "type": "boolean" }
      }
    },
    "license": { "type": "string" },
    "tags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "environment": { "$ref": "#/$defs/environment" },
    "models": {
      "type": "array",
      "items": { "$ref": "#/$defs/model" },
      "minItems": 1
    },
    "prompts": {
      "type": "array",
      "items": { "$ref": "#/$defs/prompt" },
      "minItems": 1
    },
    "runs": {
      "type": "array",
      "items": { "$ref": "#/$defs/run" },
      "minItems": 1
    },
    "findings": {
      "type": "array",
      "items": { "$ref": "#/$defs/finding" }
    },
    "verdicts": {
      "type": "array",
      "items": { "$ref": "#/$defs/verdict" }
    },
    "reproducibility": { "$ref": "#/$defs/reproducibility" },
    "links": { "$ref": "#/$defs/links" }
  }
}
```

## Where this lives in the product

- **Phase 3 Step 3.8 (export report)** — target emitter for
  `document_type: "bench-report"` (`runs` filled, no findings/verdicts). The
  Markdown export is the human-readable view derived from this JSON. Current
  `buildReport.CompareReport` is the simpler v1 to migrate.
- **QuantaMind reads this format** — display old reports, compare two, import
  shared analyses. Saved bench configurations (Step 3.7) fit as `bench-report`s.
- **Community platform (post-v1.0, beyond Phase 6)** — accepts uploads, validates
  against the JSON Schema, displays/searches by tags/models/hardware. Far future
  — do not build a submission flow until community demand pulls for it. But
  because the format is good now, every bench report is a potential submission.
