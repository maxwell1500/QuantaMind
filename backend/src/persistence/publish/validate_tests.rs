use super::*;
use crate::persistence::publish::row::PublishRow;

fn row(model: &str, pass_k: f64) -> PublishRow {
    PublishRow::sample(model, pass_k)
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

#[test]
fn rejects_empty_collection_identity() {
    let mut r = row("m", 0.9);
    r.collection_name = "  ".into();
    assert_eq!(pre_validate(&[r]).unwrap_err().1, "collection_name is empty");
    let mut r = row("m", 0.9);
    r.collection_hash = "".into();
    assert_eq!(pre_validate(&[r]).unwrap_err().1, "collection_hash is empty");
}

#[test]
fn accepts_two_rows_for_one_model_distinguished_by_eval_method() {
    // Dual-path publish sends one row per measured path: the SAME (model, quant, cohort)
    // appears twice, distinguished only by `eval_method`. pre_validate does NOT dedup by
    // model — both rows must survive. This pins the no-dedup property so a future validation
    // change that adds model-deduping fails here instead of silently dropping the prompt path.
    use crate::inference::eval::readiness::types::AgentPath;
    let mut native = row("qwen2.5-coder", 0.82);
    native.eval_method = AgentPath::NativeFc;
    let mut prompt = row("qwen2.5-coder", 0.74);
    prompt.eval_method = AgentPath::PromptBased;
    assert!(pre_validate(&[native, prompt]).is_ok());
}

#[test]
fn rejects_out_of_range_per_tier_rate() {
    use crate::inference::eval::agentic::spec::Tier;
    use crate::persistence::publish::row::TierMetric;
    let mut r = row("m", 0.9);
    r.by_tier = vec![TierMetric { tier: Tier::Hard, pass_k_rate: 1.5, k: 16, avg_steps: None, decoy_count: None }];
    assert!(pre_validate(&[r]).unwrap_err().1.contains("by_tier pass_k_rate"));
}
