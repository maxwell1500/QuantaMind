#![allow(dead_code)]
use quantamind_lib::commands::compare::compare_payloads::{
    EVENT_COMPARE_CANCELLED, EVENT_COMPARE_DONE, EVENT_COMPARE_ERROR, EVENT_COMPARE_LOADING,
    EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
};
use quantamind_lib::inference::compare::compare_sink::CompareSink;
use quantamind_lib::metrics::timeline::TokenTiming;
use serde_json::json;
use std::sync::{Arc, Mutex};

pub type EventLog = Arc<Mutex<Vec<(String, serde_json::Value)>>>;

/// Test CompareSink that records each event as (name, json) so tests can
/// assert on event order and payload fields without a Tauri runtime.
pub struct RecordingSink {
    pub log: EventLog,
}

impl RecordingSink {
    fn push(&self, event: &str, payload: serde_json::Value) {
        self.log.lock().unwrap().push((event.to_string(), payload));
    }
}

impl CompareSink for RecordingSink {
    fn loading(&self, model_id: &str, model: &str) {
        self.push(EVENT_COMPARE_LOADING, json!({"model_id": model_id, "model": model}));
    }
    fn token(&self, model_id: &str, model: &str, text: &str) {
        self.push(EVENT_COMPARE_TOKEN, json!({"model_id": model_id, "model": model, "text": text}));
    }
    fn done(&self, model_id: &str, model: &str, ttft_ms: Option<u64>, tokens_per_sec: Option<f64>, token_count: usize, timeline: &[TokenTiming]) {
        self.push(EVENT_COMPARE_DONE, json!({
            "model_id": model_id, "model": model,
            "ttft_ms": ttft_ms, "tokens_per_sec": tokens_per_sec, "token_count": token_count,
            "timeline": timeline,
        }));
    }
    fn cancelled(&self, model_id: &str, model: &str, token_count: usize) {
        self.push(EVENT_COMPARE_CANCELLED, json!({"model_id": model_id, "model": model, "token_count": token_count}));
    }
    fn error(&self, model_id: &str, model: &str, kind: &str, message: &str) {
        self.push(EVENT_COMPARE_ERROR, json!({"model_id": model_id, "model": model, "kind": kind, "message": message}));
    }
    fn run_done(&self) {
        self.push(EVENT_COMPARE_RUN_DONE, json!({}));
    }
}

pub fn recording_sink() -> (Arc<dyn CompareSink>, EventLog) {
    let log: EventLog = Arc::new(Mutex::new(Vec::new()));
    let sink: Arc<dyn CompareSink> = Arc::new(RecordingSink { log: log.clone() });
    (sink, log)
}
