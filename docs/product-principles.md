# Product Principles

The boundaries that define what QuantaMind is — and what it refuses to become.
These are commitments, not preferences. Changing one requires an explicit
decision recorded here, not a quiet drift in code.

## Core commitments

1. **Local-first, always.** Your prompts, models, hardware, and outputs stay on
   your machine. Local inference is the product.
2. **No telemetry.** No analytics SDK, no crash-reporting service, no tracking
   pixels, no usage beacons. This is a real differentiator for the
   privacy-conscious local-AI audience; the trust cost of breaking it is
   permanent. The README and this doc must always say the same thing.
3. **No account, no cloud sync.** The app runs offline once a model is
   installed. There is no QuantaMind backend.

## Cloud baseline (Phase 3) — a reference, never a path

Step 3.10 adds a way to compare a local model against a cloud model *in Bench*,
so a developer can answer "is the cloud meaningfully better, and worth the
cost?" It is a **comparison reference only**. The following limits are
**permanent** — point users here when they ask.

- **No cloud in the Workspace.** The single-model view stays local-only.
- **No cloud in the Inspector** (Phase 4). Inspector is local-performance only;
  cloud rows get a clean empty state.
- **No cloud runs in prompt history.** Cloud results are never persisted to
  history.
- **No arbitrary endpoints.** Four curated providers only (OpenAI, Anthropic,
  Google, Mistral) with a fixed ~7-model list. No Groq, Together, Fireworks,
  OpenRouter, Azure variants, or custom proxies. No user-extensible model list.
- **No provider extras.** Plain text prompts only — no tool calling, JSON mode,
  vision, or audio.
- **Keys never in plaintext.** API keys live in the OS keyring (`keyring`
  crate), validated by a "Test" button before first use.
- **Explicit consent.** A prominent first-use disclosure ("this sends your
  prompt to {provider}, subject to their terms"), opt-in per session.
- **Costs are informational.** Estimated-before / actual-after per run, plus a
  session-cumulative total that resets on app close. No billing, no historical
  cost analytics.

## Measuring adoption without telemetry

Because we ship no telemetry, we learn what's used the honest way:

- A voluntary, one-time in-app "share my usage" survey (opt-in, user-initiated).
- GitHub Discussion polls and issues.
- Qualitative feedback from the community (r/LocalLLaMA, Discord, etc.).

We never infer usage by quietly tracking it.

## Update this doc when

- A scope boundary changes (requires a recorded decision, not a code change).
- A new surface could touch cloud or external services — state its stance here
  before building it.
</content>
