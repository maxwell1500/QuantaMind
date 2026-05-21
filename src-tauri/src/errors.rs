use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("validation: {0}")]
    Validation(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("internal: {0}")]
    Internal(String),
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Validation("empty".into())).unwrap();
        assert_eq!(json, r#"{"kind":"validation","message":"empty"}"#);
    }

    #[test]
    fn not_found_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::NotFound("model x".into())).unwrap();
        assert_eq!(json, r#"{"kind":"not_found","message":"model x"}"#);
    }

    #[test]
    fn internal_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Internal("boom".into())).unwrap();
        assert_eq!(json, r#"{"kind":"internal","message":"boom"}"#);
    }

    #[test]
    fn display_format_matches_thiserror_attr() {
        assert_eq!(format!("{}", AppError::Validation("x".into())), "validation: x");
    }
}
