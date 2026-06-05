use super::super::profile::builtins;
use super::super::types::{NativeFcStatus, Readiness};
use super::{assess_report, from_column};
use crate::inference::eval::batch::BatchReport;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::report::{FailureTracker, TopError};
use crate::inference::eval::batch::{AggAgentic, BatchColumn};

fn col(passes: u32, total: u32, loops: u32, hall: u32, steps: Option<f64>) -> BatchColumn {
    BatchColumn {
        model: "m".into(),
        backend: BackendKind::Ollama,
        toolcall: None,
        agentic: Some(AggAgentic {
            passes,
            total_runs: total,
            avg_steps: steps,
            avg_output_tokens_success: None,
            schema_resilience: None,
            top_error: TopError::None,
            failures: FailureTracker {
                infinite_loop_hits: loops,
                hallucinated_completions: hall,
                malformed_json_calls: 0,
                schema_unrecovered_calls: 0,
            },
        }),
        error: None,
    }
}

#[test]
fn agentic_column_maps_pass_k_steps_and_failure_counts() {
    let i = from_column(&col(4, 5, 1, 2, Some(3.0)));
    assert_eq!(i.pass_k, Some(0.8));
    assert_eq!(i.avg_steps, Some(3.0));
    assert_eq!(i.loops, 1);
    assert_eq!(i.hallucinated, 2);
}

#[test]
fn deferred_metrics_are_not_measured_never_fabricated() {
    let i = from_column(&col(5, 5, 0, 0, Some(2.0)));
    assert_eq!(i.ms_per_step, None);
    assert_eq!(i.cliff_tokens, None);
    assert_eq!(i.fits_in_vram, None);
    assert_eq!(i.native_fc, NativeFcStatus::NotSupported);
}

#[test]
fn no_agentic_column_yields_unmeasured_pass_k_core_gate() {
    let c = BatchColumn {
        model: "m".into(),
        backend: BackendKind::Ollama,
        toolcall: None,
        agentic: None,
        error: None,
    };
    let i = from_column(&c);
    assert_eq!(i.pass_k, None);
    assert_eq!(i.loops, 0);
}

#[test]
fn zero_total_runs_is_unmeasured_not_a_fabricated_zero() {
    let i = from_column(&col(0, 0, 0, 0, None));
    assert_eq!(i.pass_k, None); // None, not Some(0.0) — never a guessed failing score
}

#[test]
fn assess_report_grades_clean_models_and_short_circuits_errors() {
    let general = builtins().into_iter().find(|p| p.id == "general-agent").unwrap();
    let report = BatchReport {
        collection_id: "c".into(),
        columns: vec![
            col(5, 5, 0, 0, Some(2.0)), // clean → Ready
            BatchColumn {
                model: "boom".into(),
                backend: BackendKind::Ollama,
                toolcall: None,
                agentic: None,
                error: Some("backend offline".into()),
            },
        ],
    };
    let verdicts = assess_report(&report, &general);
    assert_eq!(verdicts[0].model, "m");
    assert_eq!(verdicts[0].verdict.status, Readiness::Ready);
    assert_eq!(verdicts[1].verdict.status, Readiness::NotReady);
    assert!(verdicts[1].verdict.blocking[0].contains("backend offline")); // real error, not a synthesized score
}
