use super::*;

fn params(temp: f32, seed: i64) -> InferenceParams {
    InferenceParams { temperature: Some(temp), seed: Some(seed), ..Default::default() }
}

#[test]
fn per_model_params_override_the_shared_params() {
    let shared = params(0.2, 1);
    let mut per = HashMap::new();
    per.insert("b".to_string(), params(0.9, 7));
    // Model "b" has an override; "a" falls back to the shared params.
    let a = options_for("a", Some(&shared), Some(&per), 0.5);
    let b = options_for("b", Some(&shared), Some(&per), 0.5);
    assert_eq!((a.temperature, a.seed), (Some(0.2), Some(1)));
    assert_eq!((b.temperature, b.seed), (Some(0.9), Some(7)));
}

#[test]
fn temperature_falls_back_to_the_per_model_setting_when_unset() {
    // No params at all → options carry only the settings temperature.
    let opts = options_for("a", None, None, 0.42);
    assert_eq!(opts.temperature, Some(0.42));
    assert_eq!(opts.seed, None);
}
