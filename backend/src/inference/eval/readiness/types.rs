use super::vram_fit::MemoryProfile;
use crate::inference::backend::backend_kind::BackendKind;
use serde::{Deserialize, Serialize};

/// Absorbs float drift (a serialized `0.80` read back as `0.7999999999999999`,
/// or a true 4/5 = 0.8) so a threshold comparison never flips a false NotReady.
pub const EPSILON: f64 = 1e-6;

/// The context-cliff outcome for a (collection, model) — the single source of truth
/// the readiness gate and the report read (replacing a bare `Option<u32>` that
/// couldn't tell "probed, held" from "never probed"). `NotProbed` = no probe run
/// (absence in the store); `NoCliff { tested }` = accuracy held through `tested`
/// tokens; `Collapsed { depth }` = tool-call accuracy fell off at `depth` tokens (a
/// "broken baseline" maps here at the first rung — it fails from the start).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum CliffStatus {
    #[default]
    NotProbed,
    NoCliff { tested: u32 },
    Collapsed { depth: u32 },
}

/// Which measurement path produced the verdict — stated explicitly so a "Ready"
/// on the prompt-based proxy is never mistaken for the native tool-calling path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentPath {
    PromptBased,
    NativeFc,
}

/// Native function-calling result for the targeted backend. `NotSupported` ⇒ the
/// report shows N/A; we never synthesize a Pass^k for an unmeasured path.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeFcStatus {
    Tested { pass_k: f64 },
    NotSupported,
}

/// The measured facts a verdict is computed from. `Option` ⇒ "not measured" — a
/// hard-required-but-`None` metric blocks; a soft-target-but-`None` is a note.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadinessInputs {
    pub pass_k: Option<f64>,
    pub avg_steps: Option<f64>,
    pub ms_per_step: Option<u64>,
    pub cliff: CliffStatus,
    pub fits_in_vram: Option<bool>,
    /// Fits, but sits near the allocation ceiling → a soft Conditional note.
    pub vram_pressure: bool,
    pub loops: u32,
    pub hallucinated: u32,
    pub native_fc: NativeFcStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Readiness {
    Ready,
    Conditional,
    NotReady,
}

/// A transparent verdict: the status plus the exact reasons (with interpolated
/// thresholds) that produced it, and the path it was measured on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadinessVerdict {
    pub status: Readiness,
    pub blocking: Vec<String>,
    pub conditions: Vec<String>,
    pub path: AgentPath,
}

/// A verdict paired with the model it judged — one row of the Agent Report. The
/// `memory` profile is present when VRAM fit was measured (Ollama with a cap),
/// `None` for single-model backends or when no cap was supplied.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelVerdict {
    pub model: String,
    pub backend: BackendKind,
    pub verdict: ReadinessVerdict,
    #[serde(default)]
    pub memory: Option<MemoryProfile>,
    /// Efficiency telemetry for the recommender ranking (Phase 7.3), sourced
    /// native-first — the same aggregate the verdict was computed from. `None` when
    /// the model had no agentic run (sinks to the bottom of the ranking).
    #[serde(default)]
    pub avg_steps: Option<f64>,
    #[serde(default)]
    pub effort: Option<f64>,
    /// The measured Pass^k the verdict gated on (native-first), as a raw fraction —
    /// the headline reliability metric for the row. `None` when no agentic run was
    /// measured (rendered "N/A", never fabricated).
    #[serde(default)]
    pub pass_k: Option<f64>,
    /// The model's real quantization (e.g. `Q4_K_M`) from the installed-models
    /// registry — never guessed. `None` when the backend didn't report one.
    #[serde(default)]
    pub quantization: Option<String>,
    /// The model's context-cliff outcome for this collection, from the cliff store:
    /// NotProbed (rendered "N/A"), NoCliff{tested} ("✓ No cliff (≥tested)"), or
    /// Collapsed{depth} ("Collapsed at depth"). The gate only blocks when a profile
    /// opts in via `min_context_tokens` (strict: NoCliff passes iff tested ≥ min).
    #[serde(default)]
    pub cliff: CliffStatus,
}
