use super::*;

#[test]
fn temperature_for_unknown_model_returns_default() {
    let s = ModelSettingsState::default();
    assert_eq!(s.temperature_for("unknown:tag"), DEFAULT_TEMPERATURE);
}

#[test]
fn validate_rejects_below_zero() {
    assert!(validate_temperature(-0.01).is_err());
}

#[test]
fn validate_rejects_above_two() {
    assert!(validate_temperature(2.01).is_err());
}

#[test]
fn validate_rejects_nan() {
    assert!(validate_temperature(f32::NAN).is_err());
}

#[test]
fn validate_rejects_infinity() {
    assert!(validate_temperature(f32::INFINITY).is_err());
}

#[test]
fn validate_accepts_endpoints() {
    assert!(validate_temperature(0.0).is_ok());
    assert!(validate_temperature(2.0).is_ok());
}

#[test]
fn validate_accepts_default() {
    assert!(validate_temperature(DEFAULT_TEMPERATURE).is_ok());
}
