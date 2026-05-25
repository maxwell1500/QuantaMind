use super::*;

#[test]
fn email_accepts_typical_addresses() {
    assert!(looks_like_email("a@b.co"));
    assert!(looks_like_email("dev+tag@quantamind.co"));
    assert!(looks_like_email("first.last@sub.example.com"));
}

#[test]
fn email_rejects_missing_at() {
    assert!(!looks_like_email("nope.example.com"));
}

#[test]
fn email_rejects_multiple_ats() {
    assert!(!looks_like_email("a@b@c.com"));
}

#[test]
fn email_rejects_missing_dot_in_domain() {
    assert!(!looks_like_email("a@localhost"));
}

#[test]
fn email_rejects_leading_or_trailing_dot_in_domain() {
    assert!(!looks_like_email("a@.com"));
    assert!(!looks_like_email("a@example."));
}

#[test]
fn email_rejects_whitespace() {
    assert!(!looks_like_email("a b@c.com"));
    assert!(!looks_like_email("a@b .com"));
}

#[test]
fn diagnostics_always_include_app_and_os() {
    let d = build_diagnostics(None);
    assert!(d.contains("QuantaMind v"));
    assert!(d.contains("os: "));
    assert!(!d.contains("model: "));
}

#[test]
fn diagnostics_include_model_when_provided() {
    let d = build_diagnostics(Some("mistral:7b"));
    assert!(d.contains("model: mistral:7b"));
}
