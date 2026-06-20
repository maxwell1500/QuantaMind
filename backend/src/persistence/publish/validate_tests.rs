use super::*;
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::publish::row::{PublishMetrics, PublishRow};

fn row(model: &str, pass_k: f64) -> PublishRow {
    PublishRow {
        model: model.to_string(),
        quant: "Q4_K_M".to_string(),
        cohort_key: "apple-silicon/m-series/32-64gb".to_string(),
        tool_version: "0.2.0".to_string(),
        metrics: PublishMetrics { pass_k, effort: Some(1.2), avg_steps: Some(3.0) },
        params: InferenceParams::default(),
    }
}

#[test]
fn accepts_a_clean_batch() {
    assert!(pre_validate(&[row("qwen", 0.9), row("llama", 0.0), row("phi", 1.0)]).is_ok());
}

#[test]
fn flags_the_offending_row_index_for_out_of_range_pass_k() {
    let err = pre_validate(&[row("ok", 0.9), row("bad", 1.5)]).unwrap_err();
    assert_eq!(err.0, 1);
    assert!(err.1.contains("pass_k") && err.1.contains("1.5"));
}

#[test]
fn rejects_empty_model_quant_or_cohort() {
    let mut r = row("", 0.9);
    assert_eq!(pre_validate(&[r.clone()]).unwrap_err().1, "model is empty");
    r = row("m", 0.9);
    r.quant = "  ".into();
    assert_eq!(pre_validate(&[r.clone()]).unwrap_err().1, "quant is empty");
    r = row("m", 0.9);
    r.cohort_key = "".into();
    assert_eq!(pre_validate(&[r]).unwrap_err().1, "cohort_key is empty");
}

#[test]
fn rejects_nonpositive_effort_and_negative_steps() {
    let mut r = row("m", 0.9);
    r.metrics.effort = Some(0.0);
    assert!(pre_validate(&[r]).unwrap_err().1.contains("effort"));
    let mut r = row("m", 0.9);
    r.metrics.avg_steps = Some(-1.0);
    assert!(pre_validate(&[r]).unwrap_err().1.contains("avg_steps"));
}
