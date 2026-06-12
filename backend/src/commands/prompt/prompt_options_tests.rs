use super::*;

#[test]
fn maps_max_tokens_to_num_predict() {
    let p = InferenceParams { max_tokens: Some(128), ..Default::default() };
    assert_eq!(to_generate_options(&p).num_predict, Some(128));
}

#[test]
fn maps_all_fields() {
    let p = InferenceParams {
        temperature: Some(0.5), top_p: Some(0.9), top_k: Some(40),
        max_tokens: Some(256), repeat_penalty: Some(1.1), seed: Some(7),
        num_ctx: Some(32768),
    };
    let o = to_generate_options(&p);
    assert_eq!(o.temperature, Some(0.5));
    assert_eq!(o.top_p, Some(0.9));
    assert_eq!(o.top_k, Some(40));
    assert_eq!(o.num_predict, Some(256));
    assert_eq!(o.repeat_penalty, Some(1.1));
    assert_eq!(o.seed, Some(7));
    assert_eq!(o.num_ctx, Some(32768));
}

#[test]
fn empty_params_yield_empty_options() {
    assert!(to_generate_options(&InferenceParams::default()).is_empty());
}

#[test]
fn validate_accepts_in_range() {
    let p = InferenceParams {
        temperature: Some(2.0), top_p: Some(1.0), repeat_penalty: Some(0.0), ..Default::default()
    };
    assert!(validate_params(&p).is_ok());
}

#[test]
fn validate_rejects_temperature_over_two() {
    let p = InferenceParams { temperature: Some(2.1), ..Default::default() };
    assert!(validate_params(&p).is_err());
}

#[test]
fn validate_rejects_top_p_over_one() {
    let p = InferenceParams { top_p: Some(1.5), ..Default::default() };
    assert!(validate_params(&p).is_err());
}

#[test]
fn validate_rejects_nan() {
    let p = InferenceParams { temperature: Some(f32::NAN), ..Default::default() };
    assert!(validate_params(&p).is_err());
}
