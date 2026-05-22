use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("validation: {0}")]
    Validation(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("inference: {0}")]
    Inference(String),

    #[error("io: {0}")]
    Io(String),

    #[error("timeout: {0}")]
    Timeout(String),

    #[error("auth required: {0}")]
    AuthRequired(String),

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

    #[test]
    fn timeout_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::Timeout("list_models after 5s".into())).unwrap();
        assert_eq!(json, r#"{"kind":"timeout","message":"list_models after 5s"}"#);
    }

    #[test]
    fn auth_required_serializes_as_tagged_json() {
        let json = serde_json::to_string(&AppError::AuthRequired("meta-llama/Llama-3".into())).unwrap();
        assert_eq!(json, r#"{"kind":"auth_required","message":"meta-llama/Llama-3"}"#);
    }
}
