//! The vision OCR result schema — its OWN types. It is NEVER a `ModelVerdict`, so nothing in the
//! publish path can pick it up (the leaderboard takes only `ModelVerdict`). This type-level
//! separation is what keeps the vision family off the leaderboard.

use crate::inference::eval::vision::ocr_score::OcrMetrics;
use serde::{Deserialize, Serialize};

/// The honest per-task outcome. `CannotProcess` (modality gate) and `EmptyOutput` are NOT a 0% score
/// — they're distinct statuses so a text-only model never reads as "0% accurate". `Hallucinated`
/// flags invented content (vs mere inaccuracy, which stays `Scored` with a high WER).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VisionStatus {
    Scored,
    CannotProcess,
    EmptyOutput,
    Hallucinated,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct VisionReportRow {
    pub task_id: String,
    pub model: String,
    pub status: VisionStatus,
    /// CER/WER + breakdown — `Some` only for `Scored`/`Hallucinated`; `None` for
    /// `CannotProcess`/`EmptyOutput` (never a fabricated 0).
    pub metrics: Option<OcrMetrics>,
    pub extracted: String,
    pub ground_truth: String,
    /// The bundled image as a base64 data payload, so the frontend can render it beside the diff.
    pub image_b64: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct VisionReport {
    pub collection_id: String,
    pub model: String,
    pub rows: Vec<VisionReportRow>,
}
