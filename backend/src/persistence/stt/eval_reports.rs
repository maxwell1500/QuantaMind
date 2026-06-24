use crate::errors::AppResult;
use crate::inference::stt::eval::report::{SttReport, SttReportRow};
use crate::persistence::readiness::safe_filename::safe_filename;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// One streamed report per eval spec — append-only JSONL so a 1000-row sweep never
/// holds every row (or transcript/alignment matrix) in memory at once.
fn report_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.jsonl", safe_filename(id)))
}

/// Truncate (or create) the report at the start of a run.
pub fn start(dir: &Path, id: &str) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    File::create(report_path(dir, id))?;
    Ok(())
}

/// Append one scored row — O(1) OS-atomic append, flushed, so a crash only ever
/// truncates the final line (healed on load).
pub fn append_row(dir: &Path, id: &str, row: &SttReportRow) -> AppResult<()> {
    let mut f = OpenOptions::new().append(true).create(true).open(report_path(dir, id))?;
    writeln!(f, "{}", serde_json::to_string(row)?)?;
    f.flush()?;
    Ok(())
}

/// Read back the full report, or `None` if absent. A truncated/corrupt final line
/// (crash mid-write) is healed by discarding it.
pub fn load(dir: &Path, id: &str) -> AppResult<Option<SttReport>> {
    let path = report_path(dir, id);
    if !path.exists() {
        return Ok(None);
    }
    let mut rows = Vec::new();
    for line in BufReader::new(File::open(&path)?).lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<SttReportRow>(&line) {
            Ok(r) => rows.push(r),
            Err(_) => break, // truncated/corrupt tail → discard + stop
        }
    }
    Ok(Some(SttReport { rows }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(id: &str) -> SttReportRow {
        SttReportRow {
            task_id: id.into(),
            model: "whisper-base.en".into(),
            rtf: Some(2.0),
            repeat_rate: Some(0.0),
            silence_rate: Some(0.0),
            confidence: Some(0.9),
            wer: None,
        }
    }

    #[test]
    fn streamed_rows_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        start(dir.path(), "run").unwrap();
        append_row(dir.path(), "run", &row("a")).unwrap();
        append_row(dir.path(), "run", &row("b")).unwrap();
        let report = load(dir.path(), "run").unwrap().unwrap();
        assert_eq!(report.rows.len(), 2);
        assert_eq!(report.rows[1].task_id, "b");
    }

    #[test]
    fn a_truncated_final_line_is_healed() {
        let dir = tempfile::tempdir().unwrap();
        start(dir.path(), "run").unwrap();
        append_row(dir.path(), "run", &row("a")).unwrap();
        // Simulate a crash mid-write: a partial JSON line appended after a good one.
        let p = report_path(dir.path(), "run");
        let mut f = OpenOptions::new().append(true).open(&p).unwrap();
        writeln!(f, "{{\"task_id\":\"b\",\"mod").unwrap();
        let report = load(dir.path(), "run").unwrap().unwrap();
        assert_eq!(report.rows.len(), 1, "the good row survives; the torn tail is dropped");
    }

    #[test]
    fn start_truncates_a_prior_run() {
        let dir = tempfile::tempdir().unwrap();
        start(dir.path(), "run").unwrap();
        append_row(dir.path(), "run", &row("a")).unwrap();
        start(dir.path(), "run").unwrap(); // fresh run
        assert_eq!(load(dir.path(), "run").unwrap().unwrap().rows.len(), 0);
    }
}
