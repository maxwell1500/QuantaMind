use super::*;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::eval::readiness::types::{AgentPath, ModelVerdict, Readiness, ReadinessVerdict};
use crate::persistence::publish::row::PublishRow;

fn verdict(model: &str, pass_k: Option<f64>, quant: Option<&str>) -> ModelVerdict {
    ModelVerdict {
        model: model.to_string(),
        backend: BackendKind::Ollama,
        verdict: ReadinessVerdict {
            status: Readiness::Ready,
            blocking: vec!["this reason must never reach the wire".into()],
            conditions: vec![],
            path: AgentPath::NativeFc,
        },
        memory: None,
        avg_steps: Some(3.0),
        effort: Some(1.2),
        pass_k,
        quantization: quant.map(|s| s.to_string()),
        cliff_tokens: None,
    }
}

fn row(model: &str, pass_k: f64) -> PublishRow {
    PublishRow::project(&verdict(model, Some(pass_k), Some("Q4_K_M")), "apple-silicon/m-series/32-64gb".into(), "0.2.0")
        .expect("a measured verdict projects")
}

#[test]
fn project_drops_unmeasured_or_unquantized_rows() {
    assert!(PublishRow::project(&verdict("m", None, Some("Q4_K_M")), "c".into(), "0.2.0").is_none());
    assert!(PublishRow::project(&verdict("m", Some(0.8), None), "c".into(), "0.2.0").is_none());
    let r = PublishRow::project(&verdict("m", Some(0.8), Some("Q4_K_M")), "c".into(), "0.2.0").expect("ok");
    assert_eq!(r.metrics.pass_k, 0.8);
    assert_eq!(r.quant, "Q4_K_M");
}

#[test]
fn hash_is_stable_for_identical_input() {
    let a = [row("qwen", 0.9), row("llama", 0.7)];
    let b = [row("qwen", 0.9), row("llama", 0.7)];
    assert_eq!(canonical_hash(&a).unwrap(), canonical_hash(&b).unwrap());
}

#[test]
fn hash_changes_when_any_metric_changes() {
    let base = [row("qwen", 0.9)];
    let changed = [row("qwen", 0.91)];
    assert_ne!(canonical_hash(&base).unwrap(), canonical_hash(&changed).unwrap());
}

#[test]
fn canonical_json_is_metrics_only_with_sorted_keys() {
    let json = canonical_json(&[row("qwen", 0.9)]).unwrap();
    // No verdict reasons / memory / backend internals leak to the wire.
    assert!(!json.contains("this reason"));
    assert!(!json.contains("blocking") && !json.contains("memory") && !json.contains("verdict"));
    // Top-level keys sorted: cohort_key < metrics < model < quant < tool_version.
    let order: Vec<usize> = ["cohort_key", "metrics", "model", "quant", "tool_version"]
        .iter()
        .map(|k| json.find(&format!("\"{k}\"")).expect("key present"))
        .collect();
    assert!(order.windows(2).all(|w| w[0] < w[1]), "top-level keys not sorted: {json}");
    // Nested metrics keys sorted too: avg_steps < effort < pass_k.
    let m: Vec<usize> = ["avg_steps", "effort", "pass_k"]
        .iter()
        .map(|k| json.find(&format!("\"{k}\"")).expect("metric present"))
        .collect();
    assert!(m.windows(2).all(|w| w[0] < w[1]), "metric keys not sorted: {json}");
}
