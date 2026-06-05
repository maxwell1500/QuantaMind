use crate::errors::{AppError, AppResult};
use crate::inference::eval::batch::BatchReport;
use crate::persistence::readiness::safe_filename::safe_filename;
use std::path::{Path, PathBuf};

/// Same 1 MB read guard as the trace/history stores — a corrupt/huge report file
/// can't OOM the process. One collection's latest report stays well under this.
pub const MAX_BYTES: u64 = 1024 * 1024;

fn report_path(dir: &Path, collection_id: &str) -> PathBuf {
    dir.join(format!("{}.json", safe_filename(collection_id)))
}

/// Persist a collection's most-recent batch report (last-write-wins). Rust is the
/// source of truth for the readiness verdict — the report no longer lives only in
/// the frontend store, so the GUI command and a future CLI read the same bytes.
pub fn save(dir: &Path, report: &BatchReport) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(report)?;
    std::fs::write(report_path(dir, &report.collection_id), json)?;
    Ok(())
}

/// The collection's last persisted report, or `None` when none has been saved yet
/// (a missing file is not an error — the readiness page shows an empty state).
pub fn load(dir: &Path, collection_id: &str) -> AppResult<Option<BatchReport>> {
    let path = report_path(dir, collection_id);
    if !path.exists() {
        return Ok(None);
    }
    let len = std::fs::metadata(&path)?.len();
    if len > MAX_BYTES {
        return Err(AppError::Validation(format!(
            "batch report file is too large ({len} bytes > {MAX_BYTES} cap)"
        )));
    }
    Ok(Some(serde_json::from_str(&std::fs::read_to_string(&path)?)?))
}

#[cfg(test)]
#[path = "reports_tests.rs"]
mod tests;
