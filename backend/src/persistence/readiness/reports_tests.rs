use super::*;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::report::{FailureTracker, TopError};
use crate::inference::eval::batch::{AggAgentic, BatchColumn};
use tempfile::tempdir;

fn report(collection_id: &str, passes: u32) -> BatchReport {
    BatchReport {
        collection_id: collection_id.into(),
        columns: vec![BatchColumn {
            model: "qwen".into(),
            backend: BackendKind::Ollama,
            toolcall: None,
            agentic: Some(AggAgentic {
                passes,
                total_runs: 5,
                avg_steps: Some(2.4),
                avg_output_tokens_success: Some(110.0),
                schema_resilience: None,
                top_error: TopError::None,
                failures: FailureTracker::default(),
            }),
            error: None,
        }],
    }
}

#[test]
fn save_then_load_round_trips_the_report() {
    let dir = tempdir().unwrap();
    let r = report("finance", 4);
    save(dir.path(), &r).unwrap();
    assert_eq!(load(dir.path(), "finance").unwrap(), Some(r));
}

#[test]
fn load_missing_is_none_not_error() {
    let dir = tempdir().unwrap();
    assert_eq!(load(dir.path(), "never-run").unwrap(), None);
}

#[test]
fn save_is_last_write_wins() {
    let dir = tempdir().unwrap();
    save(dir.path(), &report("c", 1)).unwrap();
    save(dir.path(), &report("c", 5)).unwrap();
    let loaded = load(dir.path(), "c").unwrap().unwrap();
    assert_eq!(loaded.columns[0].agentic.as_ref().unwrap().passes, 5);
}

#[test]
fn long_collection_ids_do_not_collide() {
    let dir = tempdir().unwrap();
    let base = "company-evals-qwen3-coder-agentic-v1-test-suite";
    save(dir.path(), &report(&format!("{base}-AAAA"), 1)).unwrap();
    save(dir.path(), &report(&format!("{base}-BBBB"), 5)).unwrap();
    assert_eq!(load(dir.path(), &format!("{base}-AAAA")).unwrap().unwrap().columns[0].agentic.as_ref().unwrap().passes, 1);
    assert_eq!(load(dir.path(), &format!("{base}-BBBB")).unwrap().unwrap().columns[0].agentic.as_ref().unwrap().passes, 5);
}
