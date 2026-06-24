use crate::inference::stt::eval::wer::WerResult;
use serde::{Deserialize, Serialize};

/// One scored row — a `(model, task)` result. Every metric is `Option` → "N/A",
/// never a guessed number. `wer` is `None` when the task carried no reference
/// (behavioral-only → "accuracy unverified"); a `None` here never bleeds into the
/// other fields.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SttReportRow {
    pub task_id: String,
    pub model: String,
    pub rtf: Option<f64>,
    pub repeat_rate: Option<f64>,
    pub silence_rate: Option<f64>,
    pub confidence: Option<f64>,
    pub wer: Option<WerResult>,
}

/// All scored rows for an eval run (streamed to disk one row at a time).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct SttReport {
    pub rows: Vec<SttReportRow>,
}
