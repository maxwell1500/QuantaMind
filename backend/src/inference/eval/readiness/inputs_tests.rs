use super::super::profile::builtins;
use super::super::types::{AgentPath, NativeFcStatus, Readiness};
use super::{agentic_metrics, assess_report, from_column, verdict_for};
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
        agentic_native_fc: None,
        error: None,
    }
}

#[test]
fn agentic_column_maps_pass_k_steps_and_failure_counts() {
    let i = from_column(&col(4, 5, 1, 2, Some(3.0)), None, false);
    assert_eq!(i.pass_k, Some(0.8));
    assert_eq!(i.avg_steps, Some(3.0));
    assert_eq!(i.loops, 1);
    assert_eq!(i.hallucinated, 2);
}

#[test]
fn deferred_metrics_are_not_measured_never_fabricated() {
    let i = from_column(&col(5, 5, 0, 0, Some(2.0)), None, false);
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
        agentic_native_fc: None,
        error: None,
    };
    let i = from_column(&c, None, false);
    assert_eq!(i.pass_k, None);
    assert_eq!(i.loops, 0);
}

#[test]
fn zero_total_runs_is_unmeasured_not_a_fabricated_zero() {
    let i = from_column(&col(0, 0, 0, 0, None), None, false);
    assert_eq!(i.pass_k, None); // None, not Some(0.0) — never a guessed failing score
}

fn agg(passes: u32, total: u32, loops: u32) -> AggAgentic {
    AggAgentic {
        passes,
        total_runs: total,
        avg_steps: Some(2.0),
        avg_output_tokens_success: None,
        schema_resilience: None,
        top_error: TopError::None,
        failures: FailureTracker {
            infinite_loop_hits: loops,
            hallucinated_completions: 0,
            malformed_json_calls: 0,
            schema_unrecovered_calls: 0,
        },
    }
}

#[test]
fn prefers_the_native_aggregate_when_native_fc_was_measured() {
    let mut c = col(9, 10, 0, 0, Some(2.0)); // prompt-based pass^k 0.9
    c.agentic_native_fc = Some(agg(2, 10, 1)); // native pass^k 0.2, with a loop
    let i = from_column(&c, None, false);
    assert_eq!(i.pass_k, Some(0.2)); // the native result, NOT the 0.9 prompt proxy
    assert_eq!(i.loops, 1); // native failure breakdown
    assert_eq!(i.native_fc, NativeFcStatus::Tested { pass_k: 0.2 });
}

#[test]
fn falls_back_to_prompt_based_when_native_was_not_measured() {
    let i = from_column(&col(8, 10, 0, 0, Some(2.0)), None, false);
    assert_eq!(i.pass_k, Some(0.8));
    assert_eq!(i.native_fc, NativeFcStatus::NotSupported);
}

#[test]
fn a_prompt_passing_model_that_fails_native_is_not_ready_on_the_native_path() {
    let coding = builtins().into_iter().find(|p| p.id == "coding-agent").unwrap();
    let mut c = col(9, 10, 0, 0, Some(2.0)); // prompt 0.9 would pass coding-agent's 0.80
    c.agentic_native_fc = Some(agg(2, 10, 0)); // native 0.2 fails it
    let v = verdict_for(&c, Some(true), false, &coding); // fits VRAM (coding requires it)
    assert_eq!(v.status, Readiness::NotReady);
    assert_eq!(v.path, AgentPath::NativeFc); // the report states the native path
    assert!(v.blocking.iter().any(|b| b.contains("pass^k 0.20 < 0.80 required")));
}

#[test]
fn agentic_metrics_prefers_native_then_falls_back_to_prompt() {
    // Prompt aggregate: avg_steps 2.0. Native aggregate: avg_steps 4.0, effort 120.
    let mut c = col(5, 5, 0, 0, Some(2.0));
    c.agentic_native_fc = Some(AggAgentic {
        passes: 3,
        total_runs: 5,
        avg_steps: Some(4.0),
        avg_output_tokens_success: Some(120.0),
        schema_resilience: None,
        top_error: TopError::None,
        failures: FailureTracker::default(),
    });
    let (steps, effort) = agentic_metrics(&c);
    assert_eq!(steps, Some(4.0)); // native, NOT the prompt 2.0 — same telemetry the verdict gated on
    assert_eq!(effort, Some(120.0));

    // No native measurement → fall back to the prompt aggregate.
    let (steps2, _) = agentic_metrics(&col(5, 5, 0, 0, Some(2.0)));
    assert_eq!(steps2, Some(2.0));
}

#[test]
fn assess_report_grades_clean_models_and_short_circuits_errors() {
    let general = builtins().into_iter().find(|p| p.id == "general-agent").unwrap();
    let report = BatchReport {
        collection_id: "c".into(),
        num_ctx: None,
        columns: vec![
            col(5, 5, 0, 0, Some(2.0)), // clean → Ready
            BatchColumn {
                model: "boom".into(),
                backend: BackendKind::Ollama,
                toolcall: None,
                agentic: None,
                agentic_native_fc: None,
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
