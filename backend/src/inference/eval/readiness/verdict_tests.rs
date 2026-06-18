use super::super::profile::{builtins, ReadinessProfile};
use super::super::types::{CliffStatus, NativeFcStatus, Readiness, ReadinessInputs};
use super::assess;

/// A lenient profile: only the Pass^k core gate is active, everything else off.
fn lenient() -> ReadinessProfile {
    ReadinessProfile {
        id: "t".into(),
        name: "Test".into(),
        min_pass_k: 0.80,
        max_avg_steps: None,
        max_ms_per_step: None,
        min_context_tokens: None,
        forbid_infinite_loop: false,
        forbid_hallucinated_completion: false,
        require_full_vram: false,
        require_native_fc: false,
    }
}

/// A model that passes everything: high Pass^k, no loops/hallucinations.
fn clean_inputs() -> ReadinessInputs {
    ReadinessInputs {
        pass_k: Some(0.95),
        avg_steps: Some(2.0),
        ms_per_step: Some(800),
        cliff: CliffStatus::NoCliff { tested: 16_384 },
        fits_in_vram: Some(true),
        vram_pressure: false,
        loops: 0,
        hallucinated: 0,
        native_fc: NativeFcStatus::NotSupported,
    }
}

#[test]
fn clean_row_against_lenient_profile_is_ready() {
    let v = assess(&clean_inputs(), &lenient());
    assert_eq!(v.status, Readiness::Ready);
    assert!(v.blocking.is_empty() && v.conditions.is_empty());
}

#[test]
fn low_pass_k_blocks_with_interpolated_math() {
    let mut i = clean_inputs();
    i.pass_k = Some(0.40);
    let v = assess(&i, &lenient());
    assert_eq!(v.status, Readiness::NotReady);
    assert_eq!(v.blocking, vec!["pass^k 0.40 < 0.80 required".to_string()]);
}

#[test]
fn unmeasured_pass_k_blocks_as_the_core_gate() {
    let mut i = clean_inputs();
    i.pass_k = None; // no agentic data → a Ready verdict would be vacuous
    let v = assess(&i, &lenient());
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking[0].contains("pass^k not measured"));
}

#[test]
fn epsilon_guard_does_not_falsely_block_a_true_080() {
    let mut i = clean_inputs();
    i.pass_k = Some(0.79999999); // drift below the 0.80 bar, within EPSILON
    let v = assess(&i, &lenient());
    assert!(v.blocking.is_empty(), "drift within epsilon must not block: {:?}", v.blocking);
    assert_eq!(v.status, Readiness::Ready);
}

#[test]
fn forbidden_loop_and_hallucination_each_block() {
    let mut p = lenient();
    p.forbid_infinite_loop = true;
    p.forbid_hallucinated_completion = true;
    let mut i = clean_inputs();
    i.loops = 1;
    i.hallucinated = 2;
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    // The exact affected-run counts are interpolated (loops=1 → singular, hallucinated=2 → plural).
    assert!(v.blocking.contains(&"loops on 1 run".to_string()));
    assert!(v.blocking.contains(&"false 'done' on 2 runs".to_string()));
}

#[test]
fn required_vram_but_unmeasured_blocks() {
    let mut p = lenient();
    p.require_full_vram = true;
    let mut i = clean_inputs();
    i.fits_in_vram = None; // never measured — ignorance is not a pass
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.iter().any(|b| b.contains("VRAM fit not measured")));
}

#[test]
fn measured_partial_offload_blocks_under_require_full_vram() {
    let mut p = lenient();
    p.require_full_vram = true;
    let mut i = clean_inputs();
    i.fits_in_vram = Some(false); // measured: doesn't fit the cap
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.contains(&"partial offload → severe slowdown".to_string()));
}

#[test]
fn vram_pressure_is_a_conditional_note_independent_of_the_gate() {
    let mut i = clean_inputs(); // require_full_vram off in the lenient profile
    i.vram_pressure = true;
    let v = assess(&i, &lenient());
    assert_eq!(v.status, Readiness::Conditional);
    assert!(v.conditions.contains(&"high VRAM pressure near allocation ceiling".to_string()));
}

#[test]
fn required_context_but_unmeasured_blocks() {
    let mut p = lenient();
    p.min_context_tokens = Some(8192);
    let mut i = clean_inputs();
    i.cliff = CliffStatus::NotProbed;
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.iter().any(|b| b.contains("context headroom required (8192 tok)")));
}

#[test]
fn measured_cliff_below_requirement_blocks_with_math() {
    let mut p = lenient();
    p.min_context_tokens = Some(8192);
    let mut i = clean_inputs();
    i.cliff = CliffStatus::Collapsed { depth: 4096 };
    let v = assess(&i, &p);
    assert!(v.blocking.contains(&"reasoning cliff at 4096 < 8192 needed".to_string()));
}

#[test]
fn no_cliff_tested_to_the_requirement_passes() {
    let mut p = lenient();
    p.min_context_tokens = Some(2048);
    let mut i = clean_inputs();
    i.cliff = CliffStatus::NoCliff { tested: 4096 }; // held past the requirement
    assert_eq!(assess(&i, &p).status, Readiness::Ready);
}

#[test]
fn no_cliff_probed_short_of_the_requirement_blocks() {
    let mut p = lenient();
    p.min_context_tokens = Some(2048);
    let mut i = clean_inputs();
    i.cliff = CliffStatus::NoCliff { tested: 1024 }; // an incomplete probe is not a pass
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.iter().any(|b| b.contains("only probed to 1024 tok < 2048 needed")));
}

#[test]
fn broken_baseline_blocks_a_context_gate() {
    let mut p = lenient();
    p.min_context_tokens = Some(2048);
    let mut i = clean_inputs();
    i.cliff = CliffStatus::Broken { tested: 388 }; // fails at the smallest context
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.iter().any(|b| b.contains("broken") && b.contains("no usable context window")));
}

#[test]
fn slow_latency_is_conditional_not_blocking() {
    let mut p = lenient();
    p.max_ms_per_step = Some(5000);
    let mut i = clean_inputs();
    i.ms_per_step = Some(8400);
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::Conditional);
    assert_eq!(v.conditions, vec!["slow: 8400ms/step > 5000ms target".to_string()]);
}

#[test]
fn inefficient_steps_are_conditional() {
    let mut p = lenient();
    p.max_avg_steps = Some(3.0);
    let mut i = clean_inputs();
    i.avg_steps = Some(4.8);
    let v = assess(&i, &p);
    assert_eq!(v.status, Readiness::Conditional);
    assert_eq!(v.conditions, vec!["inefficient: 4.8 avg steps > 3.0 max".to_string()]);
}

#[test]
fn required_native_fc_blocks_when_unsupported() {
    let mut p = lenient();
    p.require_native_fc = true;
    let v = assess(&clean_inputs(), &p); // native_fc is NotSupported
    assert_eq!(v.status, Readiness::NotReady);
    assert!(v.blocking.iter().any(|b| b.contains("native tool-calling required")));
}

#[test]
fn coding_agent_gates_on_measured_vram_fit() {
    let coding = builtins().into_iter().find(|p| p.id == "coding-agent").unwrap();
    let mut overflow = clean_inputs();
    overflow.fits_in_vram = Some(false); // measured: spills past the cap
    assert_eq!(assess(&overflow, &coding).status, Readiness::NotReady);
    let mut fits = clean_inputs();
    fits.fits_in_vram = Some(true);
    assert_eq!(assess(&fits, &coding).status, Readiness::Ready); // clean + fits → Ready
}

#[test]
fn profile_edit_flips_the_verdict_deterministically() {
    let mut i = clean_inputs();
    i.pass_k = Some(0.82);
    let mut p = lenient();
    assert_eq!(assess(&i, &p).status, Readiness::Ready); // 0.82 ≥ 0.80
    p.min_pass_k = 0.90; // raise the bar
    assert_eq!(assess(&i, &p).status, Readiness::NotReady); // 0.82 < 0.90
}
