use crate::inference::eval::readiness::types::ModelVerdict;
use serde::{Deserialize, Serialize};

/// The metrics actually published — the few aggregates the leaderboard ranks and
/// the baseline worker percentiles. `pass_k` is the required headline reliability
/// metric; `effort`/`avg_steps` are soft and omitted when unmeasured (the JSONB
/// bag stays additive/forward-compatible). No task content ever lives here.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PublishMetrics {
    pub pass_k: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_steps: Option<f64>,
}

/// One publishable row: a model's identity (model + quant + hardware cohort), the
/// client version that produced it, and the metrics bag. This is the WHOLE wire
/// shape — everything in `ModelVerdict` not named here (verdict reasons, memory
/// profile, backend internals) is deliberately dropped.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PublishRow {
    pub model: String,
    pub quant: String,
    pub cohort_key: String,
    pub tool_version: String,
    pub metrics: PublishMetrics,
}

impl PublishRow {
    /// Project a verdict into the metrics-only publish row. Returns `None` when the
    /// model has no measured `pass_k` or no real quantization — an unmeasured row is
    /// excluded from the batch, never sent as a null that would skew the server's
    /// baseline `n`/percentiles (the client-side half of the null-poisoning guard).
    pub fn project(v: &ModelVerdict, cohort_key: String, tool_version: &str) -> Option<PublishRow> {
        let pass_k = v.pass_k?;
        let quant = v.quantization.clone()?;
        Some(PublishRow {
            model: v.model.clone(),
            quant,
            cohort_key,
            tool_version: tool_version.to_string(),
            metrics: PublishMetrics { pass_k, effort: v.effort, avg_steps: v.avg_steps },
        })
    }
}
