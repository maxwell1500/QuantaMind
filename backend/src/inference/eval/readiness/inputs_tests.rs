use super::super::profile::{builtins, ReadinessProfile};
use super::super::types::{AgentPath, CliffStatus, NativeFcStatus, Readiness};
use super::{agentic_metrics, assess_report, from_column, pass_k_of, verdict_for};
use crate::inference::eval::batch::BatchReport;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::agentic::scoring::report::{FailureTracker, TopError};
use crate::inference::eval::batch::{AggAgentic, BatchColumn};

fn col(passes: u32, total: u32, loops: u32, hall: u32, steps: Option<f64>) -> BatchColumn {
    BatchColumn {
        model: "m".into(),
        backend: BackendKind::Ollama,
        toolcall: None,
        agentic: Some(AggAgentic {
            tasks_passed: passes,
            tasks_total: total,
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
                unknown_tool_calls: 0,
                forbidden_calls: 0,
                turn_timeouts: 0,
            },
            by_tier: vec![],
        }),
        agentic_native_fc: None,
        error: None,
    }
}

#[test]
fn agentic_column_maps_pass_k_steps_and_failure_counts() {
    let i = from_column(&col(4, 5, 1, 2, Some(3.0)), None, false, CliffStatus::NotProbed);
    assert_eq!(i.pass_k, Some(0.8));
    assert_eq!(i.avg_steps, Some(3.0));
    assert_eq!(i.loops, 1);
    assert_eq!(i.hallucinated, 2);
}

#[test]
fn deferred_metrics_are_not_measured_never_fabricated() {
    let i = from_column(&col(5, 5, 0, 0, Some(2.0)), None, false, CliffStatus::NotProbed);
    assert_eq!(i.ms_per_step, None);
    assert_eq!(i.cliff, CliffStatus::NotProbed);
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
    let i = from_column(&c, None, false, CliffStatus::NotProbed);
    assert_eq!(i.pass_k, None);
    assert_eq!(i.loops, 0);
}

#[test]
fn zero_total_runs_is_unmeasured_not_a_fabricated_zero() {
    let i = from_column(&col(0, 0, 0, 0, None), None, false, CliffStatus::NotProbed);
    assert_eq!(i.pass_k, None); // None, not Some(0.0) — never a guessed failing score
}

fn ctx_profile(min_ctx: Option<u32>) -> ReadinessProfile {
    ReadinessProfile {
        id: "t".into(),
        name: "T".into(),
        min_pass_k: 0.5,
        max_avg_steps: None,
        max_ms_per_step: None,
        min_context_tokens: min_ctx,
        forbid_infinite_loop: false,
        forbid_hallucinated_completion: false,
        require_full_vram: false,
        require_native_fc: false,
        required_tier: crate::inference::eval::agentic::spec::Tier::Easy,
    }
}

#[test]
fn context_cliff_gate_is_opt_in_and_blocks_only_below_or_unmeasured() {
    let c = col(9, 10, 0, 0, Some(2.0)); // pass^k 0.9 clears the 0.5 bar

    // Gate OFF (None): the cliff is carried but never blocks → Ready.
    assert_eq!(verdict_for(&c, None, false, CliffStatus::Collapsed { depth: 8000 }, &ctx_profile(None)).status, Readiness::Ready);

    // Gate ON, cliff BELOW the floor → NotReady with the interpolated reason.
    let below = verdict_for(&c, None, false, CliffStatus::Collapsed { depth: 8000 }, &ctx_profile(Some(16000)));
    assert_eq!(below.status, Readiness::NotReady);
    assert!(below.blocking.iter().any(|b| b.contains("8000") && b.contains("16000")), "{:?}", below.blocking);

    // Gate ON, cliff UNMEASURED → NotReady "not measured" (never a guessed pass).
    let unmeasured = verdict_for(&c, None, false, CliffStatus::NotProbed, &ctx_profile(Some(16000)));
    assert_eq!(unmeasured.status, Readiness::NotReady);
    assert!(unmeasured.blocking.iter().any(|b| b.to_lowercase().contains("measured")), "{:?}", unmeasured.blocking);

    // Gate ON, cliff ABOVE the floor → passes (Ready).
    assert_eq!(verdict_for(&c, None, false, CliffStatus::Collapsed { depth: 32000 }, &ctx_profile(Some(16000))).status, Readiness::Ready);
}

fn agg(passes: u32, total: u32, loops: u32) -> AggAgentic {
    AggAgentic {
        tasks_passed: passes,
        tasks_total: total,
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
            unknown_tool_calls: 0,
            forbidden_calls: 0,
            turn_timeouts: 0,
        },
        by_tier: vec![],
    }
}

#[test]
fn prefers_the_native_aggregate_when_native_fc_was_measured() {
    let mut c = col(9, 10, 0, 0, Some(2.0)); // prompt-based pass^k 0.9
    c.agentic_native_fc = Some(agg(2, 10, 1)); // native pass^k 0.2, with a loop
    let i = from_column(&c, None, false, CliffStatus::NotProbed);
    assert_eq!(i.pass_k, Some(0.2)); // the native result, NOT the 0.9 prompt proxy
    assert_eq!(i.loops, 1); // native failure breakdown
    assert_eq!(i.native_fc, NativeFcStatus::Tested { pass_k: 0.2 });
}

#[test]
fn falls_back_to_prompt_based_when_native_was_not_measured() {
    let i = from_column(&col(8, 10, 0, 0, Some(2.0)), None, false, CliffStatus::NotProbed);
    assert_eq!(i.pass_k, Some(0.8));
    assert_eq!(i.native_fc, NativeFcStatus::NotSupported);
}

#[test]
fn a_prompt_passing_model_that_fails_native_is_not_ready_on_the_native_path() {
    let coding = builtins().into_iter().find(|p| p.id == "coding-agent").unwrap();
    let mut c = col(9, 10, 0, 0, Some(2.0)); // prompt 0.9 would pass coding-agent's 0.80
    c.agentic_native_fc = Some(agg(2, 10, 0)); // native 0.2 fails it
    let v = verdict_for(&c, Some(true), false, CliffStatus::NotProbed, &coding); // fits VRAM (coding requires it)
    assert_eq!(v.status, Readiness::NotReady);
    assert_eq!(v.path, AgentPath::NativeFc); // the report states the native path
    assert!(v.blocking.iter().any(|b| b.contains("pass^k 0.20 < 0.80 required")));
}

#[test]
fn ranking_puts_a_ready_model_first_regardless_of_column_order() {
    use super::super::recommend;
    let general = builtins().into_iter().find(|p| p.id == "general-agent").unwrap();
    let report = BatchReport {
        collection_id: "c".into(),
        num_ctx: None,
        columns: vec![
            // NotReady first (no agentic → the core pass^k gate blocks)…
            BatchColumn {
                model: "bad".into(),
                backend: BackendKind::Ollama,
                toolcall: None,
                agentic: None,
                agentic_native_fc: None,
                error: None,
            },
            col(5, 5, 0, 0, Some(2.0)), // …a clean Ready model ("m") second.
        ],
    };
    let mut verdicts = assess_report(&report, &general);
    recommend::rank(&mut verdicts);
    assert_eq!(verdicts[0].model, "m"); // the Ready model is ranked first
    assert_eq!(verdicts[0].verdict.status, Readiness::Ready);
    assert_eq!(verdicts[1].model, "bad");
}

#[test]
fn pass_k_of_is_native_first_then_prompt_then_none() {
    // Native present → native pass^k (3/5 = 0.6), even with a different prompt rate.
    let mut c = col(5, 5, 0, 0, Some(2.0)); // prompt 5/5
    c.agentic_native_fc = Some(AggAgentic {
        tasks_passed: 3,
        tasks_total: 5,
        passes: 3,
        total_runs: 5,
        avg_steps: Some(4.0),
        avg_output_tokens_success: Some(120.0),
        schema_resilience: None,
        top_error: TopError::None,
        failures: FailureTracker::default(),
        by_tier: vec![],
    });
    assert_eq!(pass_k_of(&c), Some(0.6)); // native, not the prompt 1.0

    // No native → prompt pass^k (4/10 = 0.4).
    assert_eq!(pass_k_of(&col(4, 10, 0, 0, Some(2.0))), Some(0.4));

    // No agentic data → None (renders N/A, never fabricated).
    let bare = BatchColumn { model: "m".into(), backend: BackendKind::Ollama, toolcall: None, agentic: None, agentic_native_fc: None, error: None };
    assert_eq!(pass_k_of(&bare), None);
}

#[test]
fn agentic_metrics_prefers_native_then_falls_back_to_prompt() {
    // Prompt aggregate: avg_steps 2.0. Native aggregate: avg_steps 4.0, effort 120.
    let mut c = col(5, 5, 0, 0, Some(2.0));
    c.agentic_native_fc = Some(AggAgentic {
        tasks_passed: 3,
        tasks_total: 5,
        passes: 3,
        total_runs: 5,
        avg_steps: Some(4.0),
        avg_output_tokens_success: Some(120.0),
        schema_resilience: None,
        top_error: TopError::None,
        failures: FailureTracker::default(),
        by_tier: vec![],
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

#[test]
fn model_verdict_carries_by_tier_and_failures_from_the_native_first_source() {
    use crate::inference::eval::agentic::spec::Tier;
    use crate::inference::eval::batch::TierStat;
    let general = builtins().into_iter().find(|p| p.id == "general-agent").unwrap();

    // Prompt aggregate has an Easy tier; the NATIVE aggregate has a Hard tier + 3 forbidden
    // calls. With native measured, the verdict's per-tier breakdown + failures must come
    // from native — the exact source the gate read — not the prompt proxy.
    let mut c = col(9, 10, 0, 0, Some(2.0));
    c.agentic.as_mut().unwrap().by_tier =
        vec![TierStat { tier: Tier::Easy, tasks_passed: 1, tasks_total: 1, avg_steps: Some(2.0), failures: FailureTracker::default() }];
    let mut native = agg(9, 10, 0);
    native.by_tier = vec![TierStat {
        tier: Tier::Hard,
        tasks_passed: 2,
        tasks_total: 4,
        avg_steps: Some(7.0),
        failures: FailureTracker { forbidden_calls: 3, ..Default::default() },
    }];
    native.failures = FailureTracker { forbidden_calls: 3, ..Default::default() };
    c.agentic_native_fc = Some(native);

    let report = BatchReport { collection_id: "c".into(), num_ctx: None, columns: vec![c] };
    let v = &assess_report(&report, &general)[0];
    assert_eq!(v.by_tier.len(), 1);
    assert_eq!(v.by_tier[0].tier, Tier::Hard); // native, NOT the prompt's Easy
    assert_eq!(v.by_tier[0].avg_steps, Some(7.0));
    assert_eq!(v.failures.forbidden_calls, 3);
}

#[test]
fn model_verdict_by_tier_falls_back_to_prompt_when_native_absent() {
    use crate::inference::eval::agentic::spec::Tier;
    use crate::inference::eval::batch::TierStat;
    let general = builtins().into_iter().find(|p| p.id == "general-agent").unwrap();
    let mut c = col(5, 5, 0, 0, Some(2.0)); // native absent (the common case — FC defaults off)
    c.agentic.as_mut().unwrap().by_tier = vec![TierStat {
        tier: Tier::Medium,
        tasks_passed: 1,
        tasks_total: 1,
        avg_steps: Some(3.0),
        failures: FailureTracker { unknown_tool_calls: 4, ..Default::default() },
    }];
    c.agentic.as_mut().unwrap().failures = FailureTracker { unknown_tool_calls: 4, ..Default::default() };
    let report = BatchReport { collection_id: "c".into(), num_ctx: None, columns: vec![c] };
    let v = &assess_report(&report, &general)[0];
    assert_eq!(v.by_tier.len(), 1);
    assert_eq!(v.by_tier[0].tier, Tier::Medium);
    assert_eq!(v.failures.unknown_tool_calls, 4); // prompt-based source, since native absent
}
