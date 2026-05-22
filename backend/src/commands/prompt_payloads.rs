use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct TokenPayload {
    pub text: String,
}

#[derive(Serialize, Clone)]
pub struct DonePayload {
    pub ttft_ms: Option<u64>,
    pub tokens_per_sec: Option<f64>,
    pub token_count: usize,
}

#[derive(Serialize, Clone)]
pub struct CancelledPayload {
    pub token_count: usize,
}
