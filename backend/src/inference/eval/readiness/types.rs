use crate::inference::backend::backend_kind::BackendKind;
use serde::{Deserialize, Serialize};

/// Absorbs float drift (a serialized `0.80` read back as `0.7999999999999999`,
/// or a true 4/5 = 0.8) so a threshold comparison never flips a false NotReady.
pub const EPSILON: f64 = 1e-6;

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
    pub cliff_tokens: Option<u32>,
    pub fits_in_vram: Option<bool>,
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

/// A verdict paired with the model it judged — one row of the Agent Report.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelVerdict {
    pub model: String,
    pub backend: BackendKind,
    pub verdict: ReadinessVerdict,
}
