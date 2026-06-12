use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One bundled eval task: a prompt plus how to deterministically score the
/// model's output. Loaded from `docs/evals/*.yaml`.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
pub struct EvalTask {
    pub id: String,
    pub category: String,
    pub prompt: String,
    pub scoring: Scoring,
}

/// Deterministic scoring rule (no execution, no judge). Tagged by `method`.
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "method", rename_all = "snake_case")]
pub enum Scoring {
    /// Output (normalized) must equal or contain `expected`.
    Exact { expected: String },
    /// The first of `choices` to appear in the output must be `expected`.
    MultipleChoice { choices: Vec<String>, expected: String },
    /// Output must contain a JSON object with these top-level `required` keys,
    /// each matching the declared flat type in `types` (string/number/boolean/
    /// object/array/null). Depth-1 only — no nested validation.
    JsonSchema {
        required: Vec<String>,
        #[serde(default)]
        types: BTreeMap<String, String>,
    },
}
