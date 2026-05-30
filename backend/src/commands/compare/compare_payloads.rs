use crate::metrics::timeline::TokenTiming;
use serde::{Deserialize, Serialize};

pub const EVENT_COMPARE_TOKEN: &str = "compare-token";
pub const EVENT_COMPARE_DONE: &str = "compare-done";
pub const EVENT_COMPARE_CANCELLED: &str = "compare-cancelled";
pub const EVENT_COMPARE_ERROR: &str = "compare-error";
pub const EVENT_COMPARE_RUN_DONE: &str = "compare-run-done";
pub const EVENT_COMPARE_LOADING: &str = "compare-loading";

#[derive(Serialize, Clone)]
pub struct CompareLoadingPayload {
    pub model_id: String,
    pub model: String,
}

#[derive(Serialize, Clone)]
pub struct CompareTokenPayload {
    pub model_id: String,
    pub model: String,
    pub text: String,
}

#[derive(Serialize, Clone)]
pub struct CompareDonePayload {
    pub model_id: String,
    pub model: String,
    pub ttft_ms: Option<u64>,
    pub tokens_per_sec: Option<f64>,
    pub token_count: usize,
    pub timeline: Vec<TokenTiming>,
}

#[derive(Serialize, Clone)]
pub struct CompareCancelledPayload {
    pub model_id: String,
    pub model: String,
    pub token_count: usize,
}

#[derive(Serialize, Clone)]
pub struct CompareErrorPayload {
    pub model_id: String,
    pub model: String,
    pub kind: String,
    pub message: String,
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Sequential,
    Parallel,
}

#[derive(Deserialize, Clone, Debug)]
pub struct RunCompareArgs {
    pub models: Vec<String>,
    pub prompt: String,
    pub strategy: Strategy,
}
