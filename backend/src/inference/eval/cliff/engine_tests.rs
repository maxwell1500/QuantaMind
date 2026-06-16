use super::*;
use crate::inference::eval::toolcall::tasks::{Call, Expected, ToolSchema, ToolTask};
use crate::inference::generate::generate_stats::GenerateStats;
use serde_json::json;

/// A scripted model whose reported prompt tokens track the real prompt length
/// (so verify-and-adjust converges) and which emits the correct call only while
/// the context stays under `threshold` — a deterministic accuracy cliff.
struct CliffModel {
    threshold: u32,
    good: String,
}

impl ModelTurn for CliffModel {
    async fn run(&self, spec: &GenerateSpec) -> AppResult<(String, GenerateStats)> {
        let chars = spec.system.as_deref().map_or(0, |s| s.len()) + spec.prompt.len();
        let toks = (chars / 4) as u32;
        let text = if toks < self.threshold { self.good.clone() } else { "I cannot help with that.".to_string() };
        Ok((text, GenerateStats { prompt_eval_count: Some(toks), ..Default::default() }))
    }
}

fn task() -> ToolTask {
    ToolTask {
        id: "t1".into(),
        category: "single".into(),
        prompt: "Get the balance for account A-1.".into(),
        tools: vec![ToolSchema {
            name: "get_balance".into(),
            description: "Look up an account balance".into(),
            parameters: json!({ "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] }),
        }],
        expected: Expected::Call(Call { name: "get_balance".into(), args: json!({ "id": "A-1" }) }),
        agentic: None,
    }
}

const GOOD: &str = r#"{"name":"get_balance","args":{"id":"A-1"}}"#;

fn source() -> CliffSource {
    CliffSource::Preset { preset: super::super::presets::CliffPreset::CorporatePolicy }
}

#[tokio::test]
async fn verify_and_adjust_lands_each_rung_within_five_percent_of_target() {
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() }; // never collapses
    let tasks = [task()];
    let ladder = [2000u32, 8000, 16000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    for p in report.points.iter() {
        let off = (p.verified_tokens as f64 - p.target_tokens as f64).abs() / p.target_tokens as f64;
        assert!(off <= 0.05, "rung {} verified {} is >5% off", p.target_tokens, p.verified_tokens);
        // The reported depth is the VERIFIED count, not the requested one.
        assert_ne!(p.verified_tokens, 0);
    }
}

#[tokio::test]
async fn detects_the_cliff_and_reports_the_last_passing_depth() {
    // Correct under ~5000 tokens, garbage above → collapses at the 8000 rung.
    let model = CliffModel { threshold: 5000, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000, 16000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();

    let collapse_at = report.points.iter().find(|p| p.target_tokens == 8000).unwrap().verified_tokens;
    let last_pass = report.points.iter().find(|p| p.target_tokens == 2000).unwrap().verified_tokens;
    assert_eq!(report.status, CliffStatus::Collapsed { depth: collapse_at });
    // cliff_tokens = the largest VERIFIED context that still passed across positions.
    assert_eq!(report.cliff_tokens, Some(last_pass));
}

#[tokio::test]
async fn early_stop_skips_the_slow_deep_rungs_once_a_cliff_is_found() {
    // Collapses past ~5000 tokens. The 16000/32000 rungs are the slowest, and once
    // the 8000 rung collapses they add nothing — they must NOT be probed.
    let model = CliffModel { threshold: 5000, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000, 16000, 32000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    let probed: Vec<u32> = report.points.iter().map(|p| p.target_tokens).collect();
    assert_eq!(probed, vec![0, 2000, 8000]); // stopped at the collapse; deep rungs skipped
    assert!(matches!(report.status, CliffStatus::Collapsed { .. }));
}

#[tokio::test]
async fn early_stop_on_a_broken_baseline_probes_no_padded_rung() {
    let model = CliffModel { threshold: 0, good: GOOD.into() }; // fails even unpadded
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000, 16000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    assert_eq!(report.points.len(), 1); // only the baseline — no expensive padded rung
    assert!(matches!(report.status, CliffStatus::Broken { .. }));
}

#[tokio::test]
async fn a_model_that_holds_throughout_reports_no_cliff() {
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    let deepest = report.points.last().unwrap().verified_tokens;
    assert_eq!(report.status, CliffStatus::NoCliff { tested: deepest });
    assert_eq!(report.cliff_tokens, Some(deepest));
}

#[tokio::test]
async fn a_broken_baseline_is_never_a_fabricated_cliff() {
    // Fails even unpadded → no baseline → Broken, never a cliff number.
    let model = CliffModel { threshold: 0, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    let base = report.points[0].verified_tokens;
    assert_eq!(report.status, CliffStatus::Broken { tested: base });
    assert_eq!(report.cliff_tokens, None);
}

#[tokio::test]
async fn a_broken_baseline_captures_the_raw_failing_output() {
    // The model refuses unpadded → Broken. The baseline rung must carry the raw
    // completion so the UI can show WHY it failed, not just a bare 0%.
    let model = CliffModel { threshold: 0, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 2000, 8000];
    let report = run_cliff(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS).await.unwrap();
    let base = &report.points[0];
    assert!(matches!(report.status, CliffStatus::Broken { .. }));
    assert_eq!(base.samples.len(), 1, "one failing task → one sample");
    assert_eq!(base.samples[0].task_id, "t1");
    assert!(base.samples[0].output.contains("cannot help"), "raw refusal text is kept verbatim: {:?}", base.samples[0].output);
}

#[tokio::test]
async fn passing_rungs_capture_no_samples() {
    // A model that holds throughout passes every task — there is nothing to explain,
    // so no rung should carry a failure sample (samples are failure-only evidence).
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() };
    let tasks = [task()];
    let report = run_cliff(&model, "m", &tasks, &source(), &[0u32, 4000, 8000], &DEFAULT_DEPTHS).await.unwrap();
    assert!(matches!(report.status, CliffStatus::NoCliff { .. }));
    for p in &report.points {
        assert!(p.samples.is_empty(), "passing rung {} kept a sample: {:?}", p.target_tokens, p.samples);
    }
}

fn agentic_task(id: &str) -> ToolTask {
    // A real agentic task carries a PLACEHOLDER `expected: no_call`; its true criterion is
    // the multi-turn `agentic.end_state`, which the single-turn cliff never scores.
    let mut t = task();
    t.id = id.into();
    t.category = "agentic".into();
    t.expected = Expected::NoCall;
    t
}

#[tokio::test]
async fn agentic_tasks_score_on_json_wellformedness_not_abstention() {
    // The bug this replaces: a valid tool call was failed as a bad abstention → fake
    // Broken 0%. Now an agentic task PASSES a rung whenever the model emits a well-formed
    // call, so a model emitting clean JSON reads as no-cliff, not Broken.
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() };
    let report = run_cliff(&model, "m", &[agentic_task("multi-step")], &source(), &[0u32, 4000], &DEFAULT_DEPTHS).await.unwrap();
    assert_eq!(report.points[0].composite, Some(1.0), "a well-formed JSON call passes the structural check");
    assert!(matches!(report.status, CliffStatus::NoCliff { .. }));
    assert!(report.points[0].samples.is_empty(), "a structural pass keeps no failure sample");
}

#[tokio::test]
async fn an_agentic_task_with_broken_json_is_a_structural_failure() {
    // Non-JSON output (no parseable call) IS a real cliff signal for an agentic task —
    // the model's tool-call FORMAT broke at this depth — so it scores 0% and is captured.
    let model = CliffModel { threshold: 0, good: GOOD.into() }; // always prose, never JSON
    let report = run_cliff(&model, "m", &[agentic_task("multi-step")], &source(), &[0u32, 4000], &DEFAULT_DEPTHS).await.unwrap();
    assert_eq!(report.points[0].composite, Some(0.0));
    assert!(matches!(report.status, CliffStatus::Broken { .. }));
    assert!(
        report.points[0].samples.iter().any(|s| s.output.contains("cannot help")),
        "the broken (non-JSON) output is captured as evidence",
    );
}

#[test]
fn build_ladder_spans_zero_to_max_across_steps() {
    assert_eq!(build_ladder(16000, 5), vec![0, 4000, 8000, 12000, 16000]);
    let l = build_ladder(10000, 4);
    assert_eq!(l.first(), Some(&0));
    assert_eq!(l.last(), Some(&10000));
    assert_eq!(l.len(), 4);
}

#[tokio::test]
async fn progress_callback_fires_once_per_rung() {
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() };
    let tasks = [task()];
    let ladder = [0u32, 4000, 8000];
    let mut seen: Vec<(usize, usize)> = Vec::new();
    let report = run_cliff_with(&model, "m", &tasks, &source(), &ladder, &DEFAULT_DEPTHS, &mut |done, total, _| {
        seen.push((done, total));
    })
    .await
    .unwrap();
    assert_eq!(seen, vec![(1, 3), (2, 3), (3, 3)]);
    assert_eq!(report.points.len(), 3);
}

#[tokio::test]
async fn the_needle_is_swept_across_all_default_depths() {
    let model = CliffModel { threshold: u32::MAX, good: GOOD.into() };
    let tasks = [task()];
    let report = run_cliff(&model, "m", &tasks, &source(), &[4000u32], &DEFAULT_DEPTHS).await.unwrap();
    let rung = &report.points[0];
    assert_eq!(rung.per_depth.len(), DEFAULT_DEPTHS.len());
    let depths: Vec<f32> = rung.per_depth.iter().map(|d| d.depth).collect();
    assert_eq!(depths, DEFAULT_DEPTHS.to_vec());
}
