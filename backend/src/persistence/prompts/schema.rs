use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone, Default)]
pub struct InferenceParams {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub top_k: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub repeat_penalty: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub num_ctx: Option<u32>,
}

#[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
pub struct PromptFile {
    pub name: String,
    #[serde(default)]
    pub system: String,
    #[serde(default)]
    pub user: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    // Legacy only: prompt files no longer persist params (global params are the
    // single source — see the frontend paramsStore). Read-tolerant so an old
    // file with a `params` block still loads; never written back.
    #[serde(default, skip_serializing)]
    pub params: InferenceParams,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "is_false")]
    pub auto_rerun: bool,
}

pub(crate) fn is_false(b: &bool) -> bool { !*b }

#[cfg(test)]
#[path = "schema_tests.rs"]
mod tests;
