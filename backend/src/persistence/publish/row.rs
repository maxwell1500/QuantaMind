use crate::inference::eval::readiness::types::ModelVerdict;
use crate::persistence::prompts::schema::InferenceParams;
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
/// client version that produced it, the metrics bag, and the inference `params` the
/// run used. This is the WHOLE wire shape — everything in `ModelVerdict` not named
/// here (verdict reasons, memory profile, backend internals) is deliberately dropped.
///
/// `params` is the global-header config in effect at publish time (the single source
/// every run reads — architecture.md rule 7). Its own fields skip-serialize when
/// unset, so an empty `{}` honestly means "ran on the backend defaults" — never a
/// fabricated value. It rides alongside `metrics` so the leaderboard knows the
/// sampling/context a `pass_k` was measured under.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PublishRow {
    pub model: String,
    pub quant: String,
    pub cohort_key: String,
    pub tool_version: String,
    pub metrics: PublishMetrics,
    pub params: InferenceParams,
}

impl PublishRow {
    /// Project a verdict + the run's params into the publish row. Returns `None` when
    /// the model has no measured `pass_k` or no real quantization — an unmeasured row
    /// is excluded from the batch, never sent as a null that would skew the server's
    /// baseline `n`/percentiles (the client-side half of the null-poisoning guard).
    pub fn project(v: &ModelVerdict, params: &InferenceParams, cohort_key: String, tool_version: &str) -> Option<PublishRow> {
        let pass_k = v.pass_k?;
        let quant = v.quantization.clone()?;
        Some(PublishRow {
            model: v.model.clone(),
            quant,
            cohort_key,
            tool_version: tool_version.to_string(),
            metrics: PublishMetrics { pass_k, effort: v.effort, avg_steps: v.avg_steps },
            params: params.clone(),
        })
    }
}
