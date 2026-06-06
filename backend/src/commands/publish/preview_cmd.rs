use crate::commands::publish::cohort::cohort_key;
use crate::commands::system::hardware::snapshot;
use crate::errors::AppError;
use crate::inference::eval::readiness::types::ModelVerdict;
use crate::persistence::publish::canonical::{canonical_hash, canonical_json};
use crate::persistence::publish::row::PublishRow;
use crate::persistence::publish::validate::pre_validate;
use serde::Serialize;

#[derive(Serialize)]
pub struct InvalidRow {
    pub index: usize,
    pub reason: String,
}

/// Everything the privacy-gate dialog needs to show EXACTLY what would be sent:
/// the projected rows, the deterministic canonical JSON + its hash, the derived
/// cohort, how many models were dropped as unmeasured, and any local validation
/// failure. No network — this only builds the preview (the POST is B3).
#[derive(Serialize)]
pub struct PublishPreview {
    pub rows: Vec<PublishRow>,
    pub canonical_json: String,
    pub hash: String,
    pub cohort_key: String,
    pub excluded_count: usize,
    pub invalid: Option<InvalidRow>,
}

/// Build the publish payload preview from the current verdicts. The cohort is
/// derived from the authoritative LOCAL hardware snapshot (never a frontend-
/// supplied one), each measured verdict is projected to a metrics-only row
/// (unmeasured/unquantized rows dropped → `excluded_count`), and the same
/// pre-validation the server runs is applied. Read-only and offline.
///
/// NOTE: this command (with auth/send) compiles OUT of enterprise builds once the
/// `enterprise` feature gate lands in B1; export stays in.
#[tauri::command]
pub fn preview_publish_payload(verdicts: Vec<ModelVerdict>) -> Result<PublishPreview, AppError> {
    build_preview(&verdicts, cohort_key(&snapshot()), env!("CARGO_PKG_VERSION"))
}

/// The pure core (no `snapshot()`/Tauri) so the projection + canonicalization are
/// testable with a fixed cohort and version.
fn build_preview(verdicts: &[ModelVerdict], cohort: String, tool_version: &str) -> Result<PublishPreview, AppError> {
    let rows: Vec<PublishRow> =
        verdicts.iter().filter_map(|v| PublishRow::project(v, cohort.clone(), tool_version)).collect();
    let excluded_count = verdicts.len() - rows.len();
    let invalid = pre_validate(&rows).err().map(|(index, reason)| InvalidRow { index, reason });
    Ok(PublishPreview {
        canonical_json: canonical_json(&rows)?,
        hash: canonical_hash(&rows)?,
        cohort_key: cohort,
        excluded_count,
        invalid,
        rows,
    })
}

#[cfg(test)]
#[path = "preview_cmd_tests.rs"]
mod tests;
