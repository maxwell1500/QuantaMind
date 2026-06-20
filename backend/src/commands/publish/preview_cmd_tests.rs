use super::*;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::readiness::types::{AgentPath, CliffStatus, Readiness, ReadinessVerdict};
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::publish::canonical::canonical_hash;

fn verdict(model: &str, pass_k: Option<f64>, quant: Option<&str>) -> ModelVerdict {
    ModelVerdict {
        model: model.to_string(),
        backend: BackendKind::Ollama,
        verdict: ReadinessVerdict {
            status: Readiness::Ready,
            blocking: vec!["secret task detail".into()],
            conditions: vec![],
            path: AgentPath::NativeFc,
            required_tier: Default::default(),
            cleared_tier: None,
        },
        memory: None,
        avg_steps: Some(3.0),
        effort: Some(1.2),
        pass_k,
        quantization: quant.map(|s| s.to_string()),
        cliff: CliffStatus::NotProbed,
        by_tier: Vec::new(),
        failures: Default::default(),
    }
}

const COHORT: &str = "apple-silicon/m3-pro/32-64gb";

#[test]
fn projects_measured_rows_and_counts_excluded() {
    let verdicts = vec![
        verdict("qwen", Some(0.9), Some("Q4_K_M")),
        verdict("unmeasured", None, Some("Q4_K_M")),
        verdict("noquant", Some(0.8), None),
    ];
    let p = build_preview(&verdicts, &InferenceParams::default(), COHORT.into(), "0.2.0").unwrap();
    assert_eq!(p.rows.len(), 1);
    assert_eq!(p.excluded_count, 2);
    assert_eq!(p.rows[0].cohort_key, COHORT);
    assert!(p.invalid.is_none());
}

#[test]
fn hash_matches_the_canonical_hash_of_the_rows() {
    let verdicts = vec![verdict("qwen", Some(0.9), Some("Q4_K_M"))];
    let p = build_preview(&verdicts, &InferenceParams::default(), COHORT.into(), "0.2.0").unwrap();
    assert_eq!(p.hash, canonical_hash(&p.rows).unwrap());
}

#[test]
fn preview_payload_never_carries_task_content() {
    let verdicts = vec![verdict("qwen", Some(0.9), Some("Q4_K_M"))];
    let p = build_preview(&verdicts, &InferenceParams::default(), COHORT.into(), "0.2.0").unwrap();
    assert!(!p.canonical_json.contains("secret task detail"));
    assert!(!p.canonical_json.contains("blocking"));
}

#[test]
fn preview_carries_the_run_params_each_row() {
    // The global-header params in effect are stamped onto every projected row, so the
    // leaderboard knows the sampling/context a pass_k was measured under.
    let params = InferenceParams { temperature: Some(0.2), num_ctx: Some(8192), ..Default::default() };
    let verdicts = vec![verdict("qwen", Some(0.9), Some("Q4_K_M"))];
    let p = build_preview(&verdicts, &params, COHORT.into(), "0.2.0").unwrap();
    assert_eq!(p.rows[0].params, params);
    assert!(p.canonical_json.contains("temperature"));
    assert!(p.canonical_json.contains("num_ctx"));
    // Unset keys are omitted — never a fabricated default on the wire.
    assert!(!p.canonical_json.contains("top_p"));
}
